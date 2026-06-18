import { wrapUntrustedContent } from "@/analysis/trustBoundary.js";
import type { AnalysisPromptParts } from "@/llm/prompt.js";
import {
	buildAnalysisRelevanceGuidance,
	buildMarketContextPreamble,
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
		"- Prefer relevance=high; use relevance=medium only when no high signals exist.",
		"- Do NOT pad top_posts to fill slots; fewer is fine when signals are thin.",
		"- Rank by expected 24h market impact, not impressions or virality.",
		"- Each why must cite one specific fact from that post's text (not generic reasoning).",
		"- relevant_count may exceed top_posts.length (it counts all desk-worthy posts).",
	].join("\n");
}

function buildExampleEmptyAnalysis(totalRetrieved: number): string {
	return JSON.stringify(
		{
			total_retrieved: totalRetrieved,
			relevant_count: 0,
			summary: "No posts in this batch were desk-worthy after review.",
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
			relevant_count: 1,
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
		'- "relevant_count": integer count of posts that pass the relevance bar',
		'- "summary": string with a 1-3 sentence aggregate narrative',
		'- "themes": array of short theme strings (may be empty)',
		'- "by_asset": array of per-asset sentiment notes',
		`- "top_posts": array of up to ${MAX_SOCIAL_MEDIA_TOP_POSTS} highest-impact posts (may be empty)`,
		"",
		"Do NOT include a separate posts array. Put per-post detail only in top_posts.",
		"Do NOT return Twitter ids or usernames — use post_id only.",
		"",
		"Critical rules:",
		"- ONLY analyze posts shown in the user prompt.",
		"- NEVER invent post_id values.",
		"- Copy each top_posts[].post_id EXACTLY from the [post_id=N] label on that post.",
		"- post_id is the label number — NOT list position, NOT a Twitter id.",
		"- relevant_count must count all desk-worthy posts (medium + high) among those shown.",
		"- top_posts should list the best candidates; prefer high, medium allowed when thin.",
		"- relevant_count must be >= top_posts.length.",
		"",
		"top_posts object fields:",
		'- "post_id": integer matching the [post_id=N] label on that post (NOT list position)',
		'- "rank": positive integer, 1 = most useful (no duplicate ranks or ids)',
		'- "relevance": "high" or "medium" (prefer high; medium only for borderline desk-worthy posts)',
		'- "assets": array of asset symbols or "MARKET" for broad macro',
		'- "signal_type": short category such as whale_alert, regulation, macro, sentiment',
		'- "why": short explanation of trading relevance for that specific post',
		"",
		"Do NOT include summary or username fields — post text is resolved server-side from post_id.",
		"",
		"Cross-field rules:",
		`- total_retrieved must equal ${totalRetrieved}`,
		"- relevant_count cannot exceed total_retrieved.",
		"- top_posts.length must not exceed the number of posts shown in the prompt.",
		"",
		"Valid example when one post stands out:",
		buildExampleSocialMediaAnalysis(totalRetrieved, sampleSignal),
		"",
		"Valid example when nothing stands out:",
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
		"Review all posts below. Set relevant_count to the number of desk-worthy posts",
		"(medium or high relevance). Synthesize themes, per-asset sentiment, and rank",
		"the best posts in top_posts.",
		"Prioritize breaking headlines from monitored wire, crypto, macro, and official accounts.",
		"",
		...(marketContext ? [buildMarketContextPreamble(marketContext), ""] : []),
		buildAnalysisRelevanceGuidance(outlookAssets),
		"",
		buildTopPostsGuidance(),
		"",
		`Outlook assets: ${outlookAssets.join(", ")}`,
		`Posts retrieved (full fetch): ${totalRetrieved}`,
		`Posts shown: ${promptSignals.length}`,
		"",
		wrapUntrustedContent("Social media posts", postsText),
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
	_promptSignals: readonly SocialMediaSignal[],
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
			"Use post_id integers only — no Twitter ids, no usernames, no posts array.",
			"Include relevant_count. Rank top_posts by impact; prefer relevance=high.",
		].join("\n"),
	};
}
