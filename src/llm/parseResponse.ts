import {
	createTradeRecommendationSchema,
	type TradeRecommendation,
	type TradeRecommendationValidation,
} from "@/schemas/TradeRecommendation.js";

export function extractJsonText(raw: string): string {
	const trimmed = raw.trim();
	const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	if (fencedMatch?.[1]) {
		return fencedMatch[1].trim();
	}

	return trimmed;
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

function normalizeRankings(rankings: unknown): unknown {
	if (Array.isArray(rankings)) {
		return rankings;
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

export function normalizeTradeRecommendationPayload(parsed: unknown): unknown {
	if (!isRecord(parsed)) {
		return parsed;
	}

	const normalized: Record<string, unknown> = { ...parsed };
	normalized.rankings = normalizeRankings(parsed.rankings);

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
	const result = schema.safeParse(normalizeTradeRecommendationPayload(parsed));
	if (!result.success) {
		throw new ParseResponseError(formatZodError(result.error));
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
