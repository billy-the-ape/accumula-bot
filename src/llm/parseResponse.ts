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
	const result = schema.safeParse(parsed);
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
