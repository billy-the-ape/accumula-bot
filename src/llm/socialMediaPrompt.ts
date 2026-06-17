import { wrapUntrustedContent } from "@/analysis/trustBoundary.js";

import type { AnalysisPromptParts } from "@/llm/prompt.js";

import {
	buildMarketContextPreamble,
	buildPostIndexCatalog,
	type SocialMediaMarketContext,
} from "@/llm/socialMediaPromptShared.js";

import { MAX_SOCIAL_MEDIA_TOP_POSTS } from "@/schemas/SocialMediaAnalysis.js";

import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";

import { formatSocialMediaSignals } from "@/sources/social_media/formatSocialMediaSignals.js";

export type { SocialMediaMarketContext };

function buildTopPostsGuidance(): string {
	return [
		"top_posts selection rules:",

		`- Include at most ${MAX_SOCIAL_MEDIA_TOP_POSTS} highest-impact posts.`,

		"- top_posts MUST contain only relevance=high posts — never include medium.",

		"- Do NOT pad top_posts to fill slots; fewer is fine when signals are thin.",

		"- Rank by expected 24h market impact, not impressions or virality.",

		"- Each why must cite one specific fact from that post's text (not generic reasoning).",
	].join("\n");
}

function buildExampleEmptyAnalysis(totalRetrieved: number): string {
	return JSON.stringify(
		{
			total_retrieved: totalRetrieved,

			summary:
				"No standout signals among the pre-filtered posts for near-term impact.",

			themes: [],

			by_asset: [],

			top_posts: [],
		},

		null,

		2,
	);
}

function buildExampleSocialMediaAnalysis(
	totalRetrieved: number,

	sampleSignal: Pick<SocialMediaSignal, "index">,
): string {
	return JSON.stringify(
		{
			total_retrieved: totalRetrieved,

			summary: "One-line aggregate read of market-moving social signals.",

			themes: ["whale flow"],

			by_asset: [
				{
					asset: "BTC",

					sentiment: "mixed",

					note: "Whale alert offset by steady ETF inflows.",
				},
			],

			top_posts: [
				{
					post_id: sampleSignal.index,

					rank: 1,

					relevance: "high",

					assets: ["BTC"],

					signal_type: "whale_alert",

					why: "Exchange inflow is the clearest near-term sell-pressure signal.",
				},
			],
		},

		null,

		2,
	);
}

function buildJsonOutputContract(
	totalRetrieved: number,

	sampleSignal: Pick<SocialMediaSignal, "index">,
): string {
	return [
		"You are a JSON API that returns machine-readable social media analysis.",

		"",

		"Output contract:",

		"- Your entire response must be one JSON object parseable by JSON.parse().",

		'- The first character must be "{" and the last character must be "}".',

		"- Do not wrap the JSON in markdown fences.",

		"- Do not include prose, headings, explanations, or reasoning outside the JSON.",

		"- Do not include comments, trailing commas, or duplicate keys.",

		"- Use double quotes for all strings.",

		"",

		"Required top-level fields:",

		`- "total_retrieved": integer equal to ${totalRetrieved} (full fetch count)`,

		'- "summary": string with a 1-3 sentence aggregate narrative',

		'- "themes": array of short theme strings (may be empty)',

		'- "by_asset": array of per-asset sentiment notes',

		`- "top_posts": array of up to ${MAX_SOCIAL_MEDIA_TOP_POSTS} highest-impact posts (may be empty)`,

		"",

		"Do NOT include a separate posts array. Put per-post detail only in top_posts.",

		"Do NOT return Twitter ids or usernames — use post_id only.",

		"Do NOT include relevant_count — relevance was determined in a prior step.",

		"",

		"Critical rules:",

		"- ONLY analyze posts shown in the user prompt (all are pre-filtered as relevant).",

		"- NEVER invent post_id values.",

		'- Copy each top_posts[].post_id EXACTLY from the "Valid post ids" list.',

		"- top_posts must use relevance=high only; never put medium-relevance posts in top_posts.",

		"",

		"top_posts object fields:",

		'- "post_id": integer matching the [post_id=N] label on that post (NOT list position)',

		'- "rank": positive integer, 1 = most useful (no duplicate ranks or ids)',

		'- "relevance": must be "high" (medium is not allowed in top_posts)',

		'- "assets": array of asset symbols or "MARKET" for broad macro',

		'- "signal_type": short category such as whale_alert, regulation, macro, sentiment',

		'- "why": short explanation of trading relevance for that specific post',

		"",

		"Do NOT include summary or username fields — post text is resolved server-side from post_id.",

		"",

		"Cross-field rules:",

		`- total_retrieved must equal ${totalRetrieved}`,

		"- top_posts.length must not exceed the number of posts shown in the prompt.",

		"",

		"Valid example when one post stands out:",

		buildExampleSocialMediaAnalysis(totalRetrieved, sampleSignal),

		"",

		"Valid example when nothing stands out for top_posts:",

		buildExampleEmptyAnalysis(totalRetrieved),
	].join("\n");
}

export type BuildSocialMediaAnalysisPromptParams = {
	promptSignals: readonly SocialMediaSignal[];

	totalRetrieved: number;

	outlookAssets: readonly string[];

	marketContext?: SocialMediaMarketContext;
};

export function buildSocialMediaAnalysisPromptParts({
	promptSignals,

	totalRetrieved,

	outlookAssets,

	marketContext,
}: BuildSocialMediaAnalysisPromptParams): AnalysisPromptParts {
	const assetList = outlookAssets.join(", ");

	const postsText = formatSocialMediaSignals(promptSignals);

	const sampleSignal = promptSignals[0] ?? {
		source: "twitter" as const,

		index: 0,

		id: "0",

		username: "example_user",

		text: "",

		asOf: "2026-01-01T00:00:00.000Z",

		impressions: 0,
	};

	const system = buildJsonOutputContract(totalRetrieved, sampleSignal);

	const user = [
		"You are a crypto social media analyst supporting a 24-hour trading outlook.",

		"",

		"Task:",

		"Synthesize the pre-filtered relevant posts below into a trading signal.",

		"Summarize themes, per-asset sentiment, and rank the highest-impact posts.",

		"",

		...(marketContext ? [buildMarketContextPreamble(marketContext), ""] : []),

		buildTopPostsGuidance(),

		"",

		`Outlook assets: ${assetList}`,

		`Posts retrieved (full fetch): ${totalRetrieved}`,

		`Posts shown: ${promptSignals.length} (all pre-filtered as relevant)`,

		"",

		"Valid post ids (use post_id exactly — not list position):",

		buildPostIndexCatalog(promptSignals),

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

export function buildSocialMediaRepairPromptParts(
	original: AnalysisPromptParts,

	parseError: string,

	invalidResponse: string,

	promptSignals: readonly SocialMediaSignal[],
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

			"Reminder — valid post ids for this batch (copy exactly):",

			buildPostIndexCatalog(promptSignals),

			"",

			"Return ONLY a corrected JSON object that matches the system instructions.",

			"Use post_id integers only — no Twitter ids, no usernames, no posts array.",

			"Do not include relevant_count. Rank top_posts by impact; relevance=high only.",
		].join("\n"),
	};
}
