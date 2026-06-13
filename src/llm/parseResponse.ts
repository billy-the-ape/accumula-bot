import {
	createTradeRecommendationSchema,
	type TradeRecommendation,
	type TradeRecommendationValidation,
} from "@/schemas/TradeRecommendation.js";

function extractBalancedJsonObject(text: string): string | null {
	const start = text.indexOf("{");
	if (start < 0) {
		return null;
	}

	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let index = start; index < text.length; index += 1) {
		const char = text[index];
		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === "\\") {
				escaped = true;
				continue;
			}
			if (char === '"') {
				inString = false;
			}
			continue;
		}

		if (char === '"') {
			inString = true;
			continue;
		}
		if (char === "{") {
			depth += 1;
			continue;
		}
		if (char === "}") {
			depth -= 1;
			if (depth === 0) {
				return text.slice(start, index + 1);
			}
		}
	}

	return null;
}

export function extractJsonText(raw: string): string {
	let trimmed = raw.trim();

	const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	if (fencedMatch?.[1]) {
		trimmed = fencedMatch[1].trim();
	}

	// qwen3 and similar models may emit a thinking block before JSON
	if (/[\s\S]*?/i.test(trimmed)) {
		trimmed = trimmed.replace(/[\s\S]*?/gi, "").trim();
	}

	const extracted = extractBalancedJsonObject(trimmed);
	return extracted ?? trimmed;
}

export class ParseResponseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ParseResponseError";
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceUnitScore(value: unknown, fallback = 0.5): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		const numericMatch = trimmed.match(/^-?\d+(?:\.\d+)?/);
		if (numericMatch) {
			return Number(numericMatch[0]);
		}

		const lower = trimmed.toLowerCase();
		if (lower.startsWith("high") || lower.includes("strong")) {
			return 0.75;
		}
		if (lower.startsWith("medium") || lower.startsWith("moderate")) {
			return 0.5;
		}
		if (lower.startsWith("low") || lower.startsWith("weak")) {
			return 0.25;
		}
		if (lower.includes("none") || lower === "n/a") {
			return 0;
		}
	}

	return fallback;
}

const SCORE_FIELD_PATTERN = /score|probability|rank|weight|outperform/i;

function extractScoreFromRankingItem(
	item: Record<string, unknown>,
	position: number,
	total: number,
): number {
	const explicitKeys = [
		"score",
		"ranking",
		"probability",
		"probability_of_outperforming_btc",
		"probability_of_outperforming",
		"outperformance_probability",
		"weight",
	] as const;

	for (const key of explicitKeys) {
		if (item[key] !== undefined) {
			return coerceUnitScore(item[key]);
		}
	}

	for (const [key, value] of Object.entries(item)) {
		if (key === "asset" || key === "symbol") {
			continue;
		}
		if (SCORE_FIELD_PATTERN.test(key)) {
			return coerceUnitScore(value);
		}
	}

	return (total - position) / total;
}

function normalizeRankingItem(
	item: unknown,
	position: number,
	total: number,
): unknown {
	if (!isRecord(item)) {
		return item;
	}

	const asset =
		typeof item.asset === "string"
			? item.asset
			: typeof item.symbol === "string"
				? item.symbol
				: undefined;

	if (!asset) {
		return item;
	}

	return {
		asset,
		score: extractScoreFromRankingItem(item, position, total),
	};
}

function normalizeRankings(rankings: unknown): unknown {
	if (Array.isArray(rankings)) {
		return rankings.map((item, index) =>
			normalizeRankingItem(item, index, rankings.length),
		);
	}

	if (!isRecord(rankings)) {
		return rankings;
	}

	const entries = Object.entries(rankings);
	if (entries.every(([, score]) => typeof score === "number")) {
		return entries.map(([asset, score]) => ({ asset, score }));
	}

	return rankings;
}

const RANKINGS_FIELD_NAMES = [
	"rankings",
	"ranking",
	"asset_rankings",
	"assetRankings",
	"scores",
] as const;

const NESTED_PAYLOAD_KEYS = [
	"analysis",
	"response",
	"result",
	"output",
] as const;

function findRankingsField(parsed: Record<string, unknown>): unknown {
	for (const key of RANKINGS_FIELD_NAMES) {
		if (parsed[key] !== undefined) {
			return parsed[key];
		}
	}

	for (const key of NESTED_PAYLOAD_KEYS) {
		const nested = parsed[key];
		if (isRecord(nested)) {
			const found = findRankingsField(nested);
			if (found !== undefined) {
				return found;
			}
		}
	}

	return undefined;
}

function synthesizeRankings(
	rankingAssets: string[],
	recommendedAsset: string | undefined,
	confidence: number,
): Array<{ asset: string; score: number }> {
	const topScore = confidence;
	const otherScore = Math.max(0, topScore - 0.1);

	return rankingAssets.map((asset) => ({
		asset,
		score: asset === recommendedAsset ? topScore : otherScore,
	}));
}

export type NormalizeTradeRecommendationOptions = {
	rankingAssets?: string[];
};

export function normalizeTradeRecommendationPayload(
	parsed: unknown,
	options: NormalizeTradeRecommendationOptions = {},
): unknown {
	if (!isRecord(parsed)) {
		return parsed;
	}

	const normalized: Record<string, unknown> = { ...parsed };
	const rankingsField = findRankingsField(parsed);
	normalized.rankings = normalizeRankings(rankingsField ?? parsed.rankings);

	if (typeof normalized.recommended_asset !== "string") {
		if (typeof parsed.recommendedAsset === "string") {
			normalized.recommended_asset = parsed.recommendedAsset;
		} else if (typeof parsed.recommended === "string") {
			normalized.recommended_asset = parsed.recommended;
		}
	}

	if (typeof normalized.confidence !== "number") {
		if (typeof parsed.confidence_score === "number") {
			normalized.confidence = parsed.confidence_score;
		} else {
			normalized.confidence = 0.5;
		}
	}

	if (
		typeof normalized.reason !== "string" ||
		normalized.reason.trim().length === 0
	) {
		if (
			typeof parsed.reasoning === "string" &&
			parsed.reasoning.trim().length > 0
		) {
			normalized.reason = parsed.reasoning;
		} else {
			normalized.reason = "No reason provided by model.";
		}
	}

	const rankings = normalized.rankings;
	if (
		(!Array.isArray(rankings) || rankings.length === 0) &&
		options.rankingAssets &&
		options.rankingAssets.length > 0
	) {
		const recommendedAsset =
			typeof normalized.recommended_asset === "string"
				? normalized.recommended_asset
				: undefined;
		const confidence =
			typeof normalized.confidence === "number" ? normalized.confidence : 0.5;
		normalized.rankings = synthesizeRankings(
			options.rankingAssets,
			recommendedAsset,
			confidence,
		);
	}

	return normalized;
}

export function parseTradeRecommendationJson(
	raw: string,
	validation: TradeRecommendationValidation,
): TradeRecommendation {
	let parsed: unknown;
	try {
		parsed = JSON.parse(extractJsonText(raw));
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown error";
		throw new ParseResponseError(`LLM response is not valid JSON: ${message}`);
	}

	const schema = createTradeRecommendationSchema(validation);
	const normalized = normalizeTradeRecommendationPayload(parsed, {
		rankingAssets: validation.rankingAssets,
	});
	const result = schema.safeParse(normalized);
	if (!result.success) {
		const snippet = raw.trim().slice(0, 500);
		throw new ParseResponseError(
			`${formatZodError(result.error)} (raw: ${snippet}${raw.length > 500 ? "…" : ""})`,
		);
	}

	return result.data;
}

function formatZodError(error: {
	issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.length > 0 ? issue.path.join(".") : "response";
			return `${path}: ${issue.message}`;
		})
		.join("; ");
}
