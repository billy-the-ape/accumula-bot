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

	const thinkBlockMatch = trimmed.match(/^[\s\S]*?<\/think>\s*/i);
	if (thinkBlockMatch) {
		trimmed = trimmed.slice(thinkBlockMatch[0].length).trim();
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

function coerceDirectionScore(value: unknown, fallback = 5): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		const numericMatch = trimmed.match(/^-?\d+(?:\.\d+)?/);
		if (numericMatch) {
			return Number(numericMatch[0]);
		}
	}

	return fallback;
}

const DIRECTION_FIELD_PATTERN =
	/direction|score|outlook|rating|forecast|trend/i;

function extractDirectionScoreFromOutlookItem(
	item: Record<string, unknown>,
): number {
	const explicitKeys = [
		"direction_score",
		"directionScore",
		"direction",
		"score",
		"outlook_score",
		"rating",
	] as const;

	for (const key of explicitKeys) {
		if (item[key] !== undefined) {
			return coerceDirectionScore(item[key]);
		}
	}

	for (const [key, value] of Object.entries(item)) {
		if (key === "asset" || key === "symbol" || key === "confidence") {
			continue;
		}
		if (DIRECTION_FIELD_PATTERN.test(key)) {
			return coerceDirectionScore(value);
		}
	}

	return 5;
}

function extractConfidenceFromOutlookItem(
	item: Record<string, unknown>,
): number {
	if (item.confidence !== undefined) {
		return coerceUnitScore(item.confidence);
	}

	if (item.confidence_score !== undefined) {
		return coerceUnitScore(item.confidence_score);
	}

	return 0.5;
}

function extractReasonFromOutlookItem(
	item: Record<string, unknown>,
): string | undefined {
	if (typeof item.reason === "string" && item.reason.trim().length > 0) {
		return item.reason.trim();
	}

	if (typeof item.reasoning === "string" && item.reasoning.trim().length > 0) {
		return item.reasoning.trim();
	}

	return undefined;
}

function normalizeOutlookItem(item: unknown): unknown {
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

	const normalized: Record<string, unknown> = {
		asset,
		direction_score: extractDirectionScoreFromOutlookItem(item),
		confidence: extractConfidenceFromOutlookItem(item),
	};

	const reason = extractReasonFromOutlookItem(item);
	if (reason) {
		normalized.reason = reason;
	}

	return normalized;
}

function normalizeOutlooks(outlooks: unknown): unknown {
	if (Array.isArray(outlooks)) {
		return outlooks.map((item) => normalizeOutlookItem(item));
	}

	if (!isRecord(outlooks)) {
		return outlooks;
	}

	const entries = Object.entries(outlooks);
	if (
		entries.every(
			([, value]) =>
				typeof value === "number" ||
				(typeof value === "object" && value !== null),
		)
	) {
		return entries.map(([asset, value]) => {
			if (typeof value === "number") {
				return {
					asset,
					direction_score: value,
					confidence: 0.5,
				};
			}

			if (isRecord(value)) {
				return normalizeOutlookItem({ asset, ...value });
			}

			return { asset, direction_score: 5, confidence: 0.5 };
		});
	}

	return outlooks;
}

const OUTLOOKS_FIELD_NAMES = [
	"outlooks",
	"outlook",
	"asset_outlooks",
	"assetOutlooks",
	"forecasts",
	"predictions",
] as const;

const NESTED_PAYLOAD_KEYS = [
	"analysis",
	"response",
	"result",
	"output",
] as const;

function findOutlooksField(parsed: Record<string, unknown>): unknown {
	for (const key of OUTLOOKS_FIELD_NAMES) {
		if (parsed[key] !== undefined) {
			return parsed[key];
		}
	}

	for (const key of NESTED_PAYLOAD_KEYS) {
		const nested = parsed[key];
		if (isRecord(nested)) {
			const found = findOutlooksField(nested);
			if (found !== undefined) {
				return found;
			}
		}
	}

	return undefined;
}

function synthesizeOutlooks(
	outlookAssets: string[],
): Array<{ asset: string; direction_score: number; confidence: number }> {
	return outlookAssets.map((asset) => ({
		asset,
		direction_score: 5,
		confidence: 0.5,
	}));
}

export type NormalizeTradeRecommendationOptions = {
	outlookAssets?: string[];
};

export function normalizeTradeRecommendationPayload(
	parsed: unknown,
	options: NormalizeTradeRecommendationOptions = {},
): unknown {
	if (!isRecord(parsed)) {
		return parsed;
	}

	const normalized: Record<string, unknown> = { ...parsed };
	const outlooksField = findOutlooksField(parsed);
	normalized.outlooks = normalizeOutlooks(outlooksField ?? parsed.outlooks);

	if (
		typeof normalized.summary !== "string" ||
		normalized.summary.trim().length === 0
	) {
		if (typeof parsed.reason === "string" && parsed.reason.trim().length > 0) {
			normalized.summary = parsed.reason;
		} else if (
			typeof parsed.reasoning === "string" &&
			parsed.reasoning.trim().length > 0
		) {
			normalized.summary = parsed.reasoning;
		}
	}

	const outlooks = normalized.outlooks;
	if (
		(!Array.isArray(outlooks) || outlooks.length === 0) &&
		options.outlookAssets &&
		options.outlookAssets.length > 0
	) {
		normalized.outlooks = synthesizeOutlooks(options.outlookAssets);
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
		outlookAssets: validation.outlookAssets,
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
