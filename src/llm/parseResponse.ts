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

function normalizeRankingItem(item: unknown): unknown {
	if (!isRecord(item)) {
		return item;
	}

	if (typeof item.asset === "string") {
		return item;
	}

	if (typeof item.symbol === "string") {
		const score =
			typeof item.score === "number"
				? item.score
				: typeof item.ranking === "number"
					? item.ranking
					: 0.5;
		return { asset: item.symbol, score };
	}

	return item;
}

function normalizeRankings(rankings: unknown): unknown {
	if (Array.isArray(rankings)) {
		return rankings.map(normalizeRankingItem);
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
		normalized.reason = "No reason provided by model.";
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
