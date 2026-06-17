import { wrapUntrustedContent } from "@/analysis/trustBoundary.js";
import type { AnalysisPromptParts } from "@/llm/prompt.js";
import {
	buildAllowedPostIdList,
	createBatchLocalPostIdValidation,
} from "@/llm/relevanceBatchPostIds.js";
import {
	buildMarketContextPreamble,
	buildRelevanceFilterGuidance,
	buildValidPostIdReminder,
	type SocialMediaMarketContext,
} from "@/llm/socialMediaPromptShared.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { formatSocialMediaRelevancePosts } from "@/sources/social_media/formatSocialMediaRelevancePosts.js";

export type { SocialMediaMarketContext };

export type BuildSocialMediaRelevancePromptParams = {
	batchSignals: readonly SocialMediaSignal[];
	batchNumber: number;
	batchCount: number;
	outlookAssets: readonly string[];
	marketContext?: SocialMediaMarketContext;
};

function toBatchLocalSignals(
	batchSignals: readonly SocialMediaSignal[],
): SocialMediaSignal[] {
	return batchSignals.map((signal, localId) => ({
		...signal,
		index: localId,
	}));
}

function buildJsonOutputContract(batchSignalCount: number): string {
	const allowedPostIds = buildAllowedPostIdList(batchSignalCount);

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
		'- "relevant_post_ids": array of integers (may be empty)',
		"",
		"Critical rules:",
		"- ONLY return post_id integers from the allowed list below.",
		"- NEVER invent post_id values.",
		"- Copy each post_id EXACTLY from the [post_id=N] label on that post.",
		"- post_id is the label number — NOT list position, NOT a Twitter id, NOT from examples.",
		"- Do not include duplicate post_id values in the array.",
		"",
		`Allowed post_id values for this batch: ${allowedPostIds}`,
		`This batch contains ${batchSignalCount} post(s).`,
		"",
		"Valid example when post_id 0 qualifies:",
		JSON.stringify({ relevant_post_ids: [0] }, null, 2),
		"",
		"Valid example when nothing qualifies:",
		JSON.stringify({ relevant_post_ids: [] }, null, 2),
	].join("\n");
}

export function buildSocialMediaRelevancePromptParts({
	batchSignals,
	batchNumber,
	batchCount,
	outlookAssets,
	marketContext,
}: BuildSocialMediaRelevancePromptParams): AnalysisPromptParts {
	const batchLocalSignals = toBatchLocalSignals(batchSignals);
	const postsText = formatSocialMediaRelevancePosts(batchLocalSignals);
	const allowedPostIds = buildAllowedPostIdList(batchSignals.length);

	const system = buildJsonOutputContract(batchSignals.length);

	const user = [
		"Task:",
		"Review the untrusted social posts below. Return relevant_post_ids for posts",
		"that pass the decision rule.",
		"",
		...(marketContext ? [buildMarketContextPreamble(marketContext), ""] : []),
		buildRelevanceFilterGuidance(outlookAssets),
		"",
		`Batch ${batchNumber} of ${batchCount} — ${batchSignals.length} post(s)`,
		`Allowed post_id values: ${allowedPostIds}`,
		"",
		wrapUntrustedContent("Social media posts", postsText),
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
	const allowedPostIds = buildAllowedPostIdList(batchSignals.length);

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
			`Allowed post_id values for this batch: ${allowedPostIds}`,
			"Reminder — valid post_id labels for this batch (copy exactly):",
			buildValidPostIdReminder(
				createBatchLocalPostIdValidation(batchSignals.length),
			),
			"",
			"Return ONLY a corrected JSON object with relevant_post_ids.",
			"Use only post_id integers from the allowed list — no Twitter ids, no usernames.",
			"Apply the strict relevance bar: empty array when nothing qualifies.",
		].join("\n"),
	};
}
