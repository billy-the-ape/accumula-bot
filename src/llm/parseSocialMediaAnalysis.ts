import { extractJsonText, ParseResponseError } from "@/llm/parseResponse.js";
import {
	createSocialMediaAnalysisLlmSchema,
	remapSocialMediaAnalysisFromLlm,
	type SocialMediaAnalysis,
	type SocialMediaAnalysisValidation,
} from "@/schemas/SocialMediaAnalysis.js";

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

export function parseSocialMediaAnalysisJson(
	raw: string,
	validation: SocialMediaAnalysisValidation,
): SocialMediaAnalysis {
	let parsed: unknown;
	try {
		parsed = JSON.parse(extractJsonText(raw));
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown error";
		throw new ParseResponseError(`LLM response is not valid JSON: ${message}`);
	}

	const schema = createSocialMediaAnalysisLlmSchema(validation);
	const result = schema.safeParse(parsed);
	if (!result.success) {
		const snippet = raw.trim().slice(0, 500);
		throw new ParseResponseError(
			`${formatZodError(result.error)} (raw: ${snippet}${raw.length > 500 ? "…" : ""})`,
		);
	}

	try {
		return remapSocialMediaAnalysisFromLlm(result.data, validation);
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown error";
		throw new ParseResponseError(message);
	}
}
