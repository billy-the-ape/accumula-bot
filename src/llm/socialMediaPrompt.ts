import { wrapUntrustedContent } from "@/analysis/trustBoundary.js";
import type { AnalysisPromptParts } from "@/llm/prompt.js";
import { MAX_SOCIAL_MEDIA_TOP_POSTS } from "@/schemas/SocialMediaAnalysis.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { formatSocialMediaSignals } from "@/sources/social_media/formatSocialMediaSignals.js";

function buildRelevanceGuidance(outlookAssets: readonly string[]): string {
	const assetList = outlookAssets.join(", ");

	return [
		"Relevance bar (24-hour trading horizon):",
		"- Include ONLY posts that could plausibly change near-term positioning for",
		`  ${assetList} or broad crypto risk appetite within 24 hours.`,
		"- A post qualifies only if it reports a concrete, new catalyst — not vibes.",
		"",
		"Strong signals (usually top_posts material):",
		"- Large on-chain / exchange flows, ETF or treasury flows, liquidation cascades",
		"- New regulation, enforcement, policy, or major legal outcomes",
		"- Macro prints or central-bank / fiscal news with clear risk-on/risk-off read",
		"- Credible breaking news on hacks, insolvencies, exchange outages, delistings",
		"- Official or first-source announcements affecting an outlook asset",
		"- World or US news events with market-moving potential",
		"",
		"Usually NOT relevant — omit from top_posts even if crypto-related:",
		"- Generic price cheer, hopium, bear memes, or recap threads without new facts",
		"- Vague technical analysis with no new catalyst (support/resistance chatter)",
		"- Old news, rehashed headlines, or commentary on moves that already happened",
		"- Personal takes, podcasts, newsletters, or engagement bait without a fact",
		"- Politics, culture war, or celebrity posts unless they announce concrete policy",
		"- Promotions, referral links, airdrops, NFT mints, or product marketing",
		"- Posts about unrelated assets with no read-through to the outlook assets",
		"",
		"top_posts selection rules:",
		`- Include at most ${MAX_SOCIAL_MEDIA_TOP_POSTS} posts; prefer 0–2 when the batch is noisy.`,
		"- top_posts MUST contain only relevance=high posts — never include medium.",
		"- Do NOT pad top_posts to fill slots; an empty array is correct when nothing clears the bar.",
		"- Rank by expected 24h market impact, not impressions or virality.",
		"- Each why must cite one specific fact from that post's text (not generic reasoning).",
		"- relevant_count should count only posts you would actually trade on, not everything",
		"  mildly crypto-related.",
	].join("\n");
}

function buildExampleEmptyAnalysis(totalRetrieved: number): string {
	return JSON.stringify(
		{
			total_retrieved: totalRetrieved,
			relevant_count: 0,
			summary:
				"No posts in this batch met the high bar for near-term market impact.",
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
					post_index: sampleSignal.index,
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

function buildPostIndexCatalog(
	promptSignals: readonly SocialMediaSignal[],
): string {
	return promptSignals
		.map(
			(signal) =>
				`${signal.index} → @${signal.username}: ${signal.text.slice(0, 80)}${signal.text.length > 80 ? "…" : ""}`,
		)
		.join("\n");
}

function buildJsonOutputContract(
	totalRetrieved: number,
	promptSignalCount: number,
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
		`- "total_retrieved": integer equal to ${totalRetrieved} (full batch count)`,
		'- "relevant_count": integer estimate of market-relevant posts among those shown',
		'- "summary": string with a 1-3 sentence aggregate narrative',
		'- "themes": array of short theme strings (may be empty)',
		'- "by_asset": array of per-asset sentiment notes',
		`- "top_posts": array of up to ${MAX_SOCIAL_MEDIA_TOP_POSTS} highest-impact posts (often 0–2; may be empty)`,
		"",
		"Do NOT include a separate posts array. Put per-post detail only in top_posts.",
		"Do NOT return Twitter ids or usernames — use post_index only.",
		"",
		"Critical rules:",
		"- ONLY analyze posts shown in the user prompt.",
		"- NEVER invent post_index values.",
		'- Copy each top_posts[].post_index EXACTLY from the "Valid post indices" list.',
		"- If no posts clear the high bar, return relevant_count=0 with empty top_posts.",
		"- top_posts must use relevance=high only; never put medium-relevance posts in top_posts.",
		"",
		"top_posts object fields:",
		'- "post_index": integer matching the [index=N] label on that post (NOT list position)',
		'- "rank": positive integer, 1 = most useful (no duplicate ranks or indices)',
		'- "relevance": must be "high" (medium is not allowed in top_posts)',
		'- "assets": array of asset symbols or "MARKET" for broad macro',
		'- "signal_type": short category such as whale_alert, regulation, macro, sentiment',
		'- "why": short explanation of trading relevance for that specific post',
		"",
		"Do NOT include summary or username fields — post text is resolved server-side from post_index.",
		"",
		"Cross-field rules:",
		`- total_retrieved must equal ${totalRetrieved}`,
		`- relevant_count must be between top_posts.length and ${promptSignalCount}`,
		"",
		`Only ${promptSignalCount} of ${totalRetrieved} retrieved posts are shown (highest impressions first).`,
		"",
		"Valid example when one post qualifies:",
		buildExampleSocialMediaAnalysis(totalRetrieved, sampleSignal),
		"",
		"Valid example when nothing qualifies:",
		buildExampleEmptyAnalysis(totalRetrieved),
	].join("\n");
}

export type SocialMediaMarketContext = {
	content: string;
	generatedAt: Date;
};

export type BuildSocialMediaAnalysisPromptParams = {
	promptSignals: readonly SocialMediaSignal[];
	totalRetrieved: number;
	outlookAssets: readonly string[];
	marketContext?: SocialMediaMarketContext;
};

function buildMarketContextPreamble(
	marketContext: SocialMediaMarketContext,
): string {
	return [
		`Market context (desk briefing generated ${marketContext.generatedAt.toISOString()};):`,
		marketContext.content,
		"",
		"End of market context.",
		"Use this as background when reading the social posts below.",
		"It may be incomplete or outdated — posts are the primary evidence.",
		"If a post contradicts the briefing, prefer the post when it reports a concrete new fact.",
	].join("\n");
}

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

	const system = buildJsonOutputContract(
		totalRetrieved,
		promptSignals.length,
		sampleSignal,
	);

	const user = [
		"You are a crypto social media analyst supporting a 24-hour trading outlook.",
		"Be selective — most posts in a typical batch are noise.",
		"",
		"Task:",
		"Review the untrusted social posts below. Select ONLY posts with a concrete,",
		"near-term catalyst for the outlook assets. When in doubt, exclude.",
		"",
		...(marketContext ? [buildMarketContextPreamble(marketContext), ""] : []),
		buildRelevanceGuidance(outlookAssets),
		"",
		`Outlook assets: ${assetList}`,
		`Posts retrieved (full batch): ${totalRetrieved}`,
		`Posts shown in this prompt: ${promptSignals.length} (highest impressions first)`,
		"High impressions alone do NOT make a post relevant.",
		"",
		"Valid post indices (use post_index exactly — not list position):",
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
			"Reminder — valid post indices for this batch (copy exactly):",
			buildPostIndexCatalog(promptSignals),
			"",
			"Return ONLY a corrected JSON object that matches the system instructions.",
			"Use post_index integers only — no Twitter ids, no usernames, no posts array.",
			"Apply the strict relevance bar: top_posts = high-impact only, relevance=high, empty array if needed.",
		].join("\n"),
	};
}
