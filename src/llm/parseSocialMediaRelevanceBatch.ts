import { extractJsonText, ParseResponseError } from "@/llm/parseResponse.js";
import {
	createSocialMediaRelevanceBatchLlmSchema,
	type SocialMediaRelevanceBatch,
	SocialMediaRelevanceBatchSchema,
	type SocialMediaRelevanceBatchValidation,
} from "@/schemas/SocialMediaRelevanceBatch.js";

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

export function parseSocialMediaRelevanceBatchJson(
	raw: string,
	validation: SocialMediaRelevanceBatchValidation,
): SocialMediaRelevanceBatch {
	let parsed: unknown;
	try {
		parsed = JSON.parse(extractJsonText(raw));
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown error";
		throw new ParseResponseError(`LLM response is not valid JSON: ${message}`);
	}

	const schema = createSocialMediaRelevanceBatchLlmSchema(validation);
	const result = schema.safeParse(parsed);
	if (!result.success) {
		const snippet = raw.trim().slice(0, 500);
		throw new ParseResponseError(
			`${formatZodError(result.error)} (raw: ${snippet}${raw.length > 500 ? "…" : ""})`,
		);
	}

	return SocialMediaRelevanceBatchSchema.parse(result.data);
}
