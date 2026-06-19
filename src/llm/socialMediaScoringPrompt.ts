import { wrapUntrustedContent } from "@/analysis/trustBoundary.js";
import type { AnalysisPromptParts } from "@/llm/prompt.js";
import {
	buildMarketContextPreamble,
	buildOutlookAssetListWithAliases,
	type SocialMediaMarketContext,
} from "@/llm/socialMediaPromptShared.js";
import { formatAllowedPostIndexHint } from "@/schemas/SocialMediaRelevanceScore.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { formatSocialMediaSignals } from "@/sources/social_media/formatSocialMediaSignals.js";

function buildRelevanceScoringGuidance(
	outlookAssets: readonly string[],
): string {
	const assetList = buildOutlookAssetListWithAliases(outlookAssets);

	return [
		"Scoring guidance:",
		`Score every post for near-term market impact on ${assetList} and broad crypto/macro risk.`,
		"relevance_score is an integer from 1 (least important) to 10 (most important).",
		"Judge potential effect on price action and market positioning — not account fame.",
		"Prioritize breaking headlines, flows, policy, macro prints, and credible wire reporting.",
		"Give low scores to memes, promos, pure price cheer, and TA chatter with no new information.",
		"You must return exactly one score entry for every post in this batch.",
	].join("\n");
}

function buildJsonOutputContract(
	batchSignals: readonly SocialMediaSignal[],
): string {
	const allowedPostIndices = formatAllowedPostIndexHint(batchSignals);

	return [
		"You are a JSON API that scores social media posts for crypto market relevance.",
		"",
		"Output contract:",
		"- Your entire response must be one JSON object parseable by JSON.parse().",
		'- The first character must be "{" and the last character must be "}".',
		"- Do not wrap the JSON in markdown fences.",
		"- Do not include prose, headings, explanations, or reasoning outside the JSON.",
		"",
		"Required top-level fields:",
		'- "scores": array with one entry per post shown in the user prompt',
		"",
		"scores object fields:",
		'- "post_index": integer copied exactly from [post_id=N] on that post',
		'- "relevance_score": integer from 1 to 10',
		"",
		"Critical rules:",
		`- Return exactly ${batchSignals.length} score entries.`,
		"- ONLY score posts shown in the user prompt.",
		"- NEVER invent post_index values.",
		`- Valid post_index values: ${allowedPostIndices}.`,
		"",
		"Valid example:",
		JSON.stringify(
			{
				scores: [
					{ post_index: 10042, relevance_score: 9 },
					{ post_index: 10087, relevance_score: 3 },
				],
			},
			null,
			2,
		),
	].join("\n");
}

export type BuildSocialMediaScoringPromptParams = {
	batchSignals: readonly SocialMediaSignal[];
	outlookAssets: readonly string[];
	marketContext?: SocialMediaMarketContext;
	batchNumber: number;
	batchCount: number;
};

export function buildSocialMediaScoringPromptParts({
	batchSignals,
	outlookAssets,
	marketContext,
	batchNumber,
	batchCount,
}: BuildSocialMediaScoringPromptParams): AnalysisPromptParts {
	const postsText = formatSocialMediaSignals(batchSignals);
	const system = buildJsonOutputContract(batchSignals);

	const user = [
		"You are scoring social media posts for crypto trading relevance.",
		"",
		"Task:",
		"Assign a relevance_score from 1 to 10 to every post below.",
		"",
		...(marketContext ? [buildMarketContextPreamble(marketContext), ""] : []),
		buildRelevanceScoringGuidance(outlookAssets),
		"",
		`Outlook assets: ${outlookAssets.join(", ")}`,
		`Batch: ${batchNumber}/${batchCount}`,
		`Posts in batch: ${batchSignals.length}`,
		"",
		wrapUntrustedContent("Social media posts", postsText),
		"",
		"Return only the JSON object described in the system instructions.",
	].join("\n");

	return { system, user };
}

const MAX_INVALID_RESPONSE_LOG_CHARS = 2_000;

export function buildSocialMediaScoringRepairPromptParts(
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
			"Return ONLY a corrected JSON object that matches the system instructions.",
			`Include exactly ${batchSignals.length} score entries — one per post shown above.`,
			"post_index must match [post_id=N] labels exactly.",
		].join("\n"),
	};
}
