import { wrapUntrustedContent } from "@/analysis/trustBoundary.js";
import type { AnalysisPromptParts } from "@/llm/prompt.js";
import {
	buildMarketContextPreamble,
	buildPostIndexCatalog,
	buildRelevanceFilterGuidance,
	type SocialMediaMarketContext,
} from "@/llm/socialMediaPromptShared.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { formatSocialMediaSignals } from "@/sources/social_media/formatSocialMediaSignals.js";

export type { SocialMediaMarketContext };

export type BuildSocialMediaRelevancePromptParams = {
	batchSignals: readonly SocialMediaSignal[];
	batchNumber: number;
	batchCount: number;
	outlookAssets: readonly string[];
	marketContext?: SocialMediaMarketContext;
};

function buildJsonOutputContract(
	sampleIndex: number,
	batchSignalCount: number,
): string {
	return [
		"You are a JSON API that filters social media posts for trading relevance.",
		"",
		"Output contract:",
		"- Your entire response must be one JSON object parseable by JSON.parse().",
		'- The first character must be "{" and the last character must be "}".',
		"- Do not wrap the JSON in markdown fences.",
		"- Do not include prose, headings, explanations, or reasoning outside the JSON.",
		"- Do not include comments, trailing commas, or duplicate keys.",
		"- Use double quotes for all strings.",
		"",
		"Required top-level field:",
		'- "relevant_post_indices": array of integers (may be empty)',
		"",
		"Critical rules:",
		"- ONLY return post_index values from posts shown in the user prompt.",
		"- NEVER invent post_index values.",
		'- Copy each index EXACTLY from the "Valid post indices" list.',
		"- Do not include duplicate indices in the array.",
		"- Do NOT return Twitter ids, usernames, or any other fields.",
		"",
		`This batch contains ${batchSignalCount} post(s).`,
		"",
		"Valid example when one post qualifies:",
		JSON.stringify({ relevant_post_indices: [sampleIndex] }, null, 2),
		"",
		"Valid example when nothing qualifies:",
		JSON.stringify({ relevant_post_indices: [] }, null, 2),
	].join("\n");
}

export function buildSocialMediaRelevancePromptParts({
	batchSignals,
	batchNumber,
	batchCount,
	outlookAssets,
	marketContext,
}: BuildSocialMediaRelevancePromptParams): AnalysisPromptParts {
	const assetList = outlookAssets.join(", ");
	const postsText = formatSocialMediaSignals(batchSignals);
	const sampleIndex = batchSignals[0]?.index ?? 0;

	const system = buildJsonOutputContract(sampleIndex, batchSignals.length);

	const user = [
		`You are a crypto social media analyst supporting a 24-hour trading outlook analyzing Outlook assets: ${assetList}.`,
		"",
		"Task:",
		"Review the untrusted social posts in this batch. Return post_index values",
		"for posts with a concrete, near-term catalyst for the outlook assets.",
		"When in doubt, exclude.",
		"",
		...(marketContext ? [buildMarketContextPreamble(marketContext), ""] : []),
		buildRelevanceFilterGuidance(outlookAssets),
		"",
		`Outlook assets: ${assetList}`,
		`Batch ${batchNumber} of ${batchCount}`,
		`Posts in this batch: ${batchSignals.length}`,
		"",
		"Valid post indices (use post_index exactly — not list position):",
		buildPostIndexCatalog(batchSignals),
		"",
		"--- Start of social media posts ---",
		wrapUntrustedContent("Social media posts", postsText),
		"--- End of social media posts ---",
		"",
		"Return only the JSON object described in the system instructions.",
	].join("\n");

	return { system, user };
}

const MAX_INVALID_RESPONSE_LOG_CHARS = 2_000;

export function buildSocialMediaRelevanceRepairPromptParts(
	original: AnalysisPromptParts,
	parseError: string,
	invalidResponse: string,
	batchSignals: readonly SocialMediaSignal[],
): AnalysisPromptParts {
	const truncatedResponse = invalidResponse.slice(
		0,
		MAX_INVALID_RESPONSE_LOG_CHARS,
	);
	const truncatedSuffix =
		invalidResponse.length > MAX_INVALID_RESPONSE_LOG_CHARS ? "…" : "";

	return {
		system: original.system,
		user: [
			original.user,
			"",
			"Your previous response could not be parsed as valid JSON.",
			`Parse error: ${parseError}`,
			"",
			"Invalid response:",
			`${truncatedResponse}${truncatedSuffix}`,
			"",
			"Reminder — valid post indices for this batch (copy exactly):",
			buildPostIndexCatalog(batchSignals),
			"",
			"Return ONLY a corrected JSON object with relevant_post_indices.",
			"Use post_index integers only — no Twitter ids, no usernames, no other fields.",
			"Apply the strict relevance bar: empty array when nothing qualifies.",
		].join("\n"),
	};
}
