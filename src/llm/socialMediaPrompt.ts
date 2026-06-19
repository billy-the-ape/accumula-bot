import { wrapUntrustedContent } from "@/analysis/trustBoundary.js";
import type { AnalysisPromptParts } from "@/llm/prompt.js";
import {
	buildMarketContextPreamble,
	buildSummaryAnalysisGuidance,
	type SocialMediaMarketContext,
} from "@/llm/socialMediaPromptShared.js";
import {
	formatAllowedPostIdHint,
	MAX_SOCIAL_MEDIA_TOP_POSTS,
} from "@/schemas/SocialMediaAnalysis.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { formatSocialMediaSignals } from "@/sources/social_media/formatSocialMediaSignals.js";

export type { SocialMediaMarketContext };

function buildTopPostsGuidance(
	promptSignals: readonly SocialMediaSignal[],
): string {
	const allowedPostIds = formatAllowedPostIdHint(promptSignals);
	return [
		"top_posts selection rules:",
		`- Include at most ${MAX_SOCIAL_MEDIA_TOP_POSTS} posts that were most informative for the summary.`,
		"- Do NOT pad top_posts; fewer is fine when only one or two posts mattered.",
		"- Order the array most-informative first (index 0 = your #1 pick).",
		"- Each entry must correspond to a fact or theme in summary.",
		"- Include at most ONE post per username — pick that user's single best post.",
		"- Do NOT pick a post just because of who wrote it; judge the text only.",
		"- Read the entire batch before choosing; do not stop after the first few posts.",
		`- post_id must be copied exactly from [post_id=N] on that post (${allowedPostIds}).`,
		"- post_id is NOT a rank, NOT a Twitter id, and NOT a 0-based position in the list.",
		"- Do NOT use small integers like 0–5 unless that exact [post_id=N] label appears.",
		'- "why" must mention a concrete detail from that post (number, event, asset, or quoted phrase).',
		'- Bad why: "Key macro headline from a trusted wire account".',
		'- Good why: "Reports CPI came in at 3.2% vs 3.0% expected".',
	].join("\n");
}

function buildExampleEmptyAnalysis(totalRetrieved: number): string {
	return JSON.stringify(
		{
			total_retrieved: totalRetrieved,
			summary: "- No material headlines for outlook assets in this batch.",
			themes: [],
			by_asset: [],
			top_posts: [],
		},
		null,
		2,
	);
}

function buildExampleSocialMediaAnalysis(totalRetrieved: number): string {
	return JSON.stringify(
		{
			total_retrieved: totalRetrieved,
			summary:
				"- 15,000 BTC transferred to Coinbase (whale flow, near-term supply risk)\n- Fed speakers reiterated higher-for-longer (macro headwind for risk assets)",
			themes: ["whale flow", "macro"],
			by_asset: [
				{
					asset: "BTC",
					sentiment: "mixed",
					note: "Whale inflow offset by steady ETF inflows.",
				},
			],
			top_posts: [
				{
					post_id: 10042,
					assets: ["BTC"],
					signal_type: "whale_alert",
					why: "Reports 15,000 BTC transferred to Coinbase.",
				},
				{
					post_id: 10087,
					assets: ["MARKET"],
					signal_type: "macro",
					why: "Fed speakers reiterated higher-for-longer stance.",
				},
			],
		},
		null,
		2,
	);
}

function buildJsonOutputContract(
	totalRetrieved: number,
	promptSignals: readonly SocialMediaSignal[],
): string {
	const allowedPostIds = formatAllowedPostIdHint(promptSignals);

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
		'- "summary": bullet-list string (each line starts with "- ")',
		'- "themes": array of short theme strings (may be empty)',
		'- "by_asset": array of per-asset sentiment notes (may be empty)',
		`- "top_posts": ordered array (most-informative first) of up to ${MAX_SOCIAL_MEDIA_TOP_POSTS} posts (may be empty)`,
		"",
		"Do NOT include a separate posts array. Put per-post detail only in top_posts.",
		"Do NOT return Twitter ids or usernames — use post_id only.",
		"Do NOT include relevant_count or rank — both are derived server-side.",
		"",
		"Critical rules:",
		"- ONLY use posts shown in the user prompt.",
		"- NEVER invent post_id values.",
		`- Valid post_id values: ${allowedPostIds}.`,
		"- Copy post_id exactly from the [post_id=N] label on that post.",
		"",
		"top_posts object fields:",
		'- "post_id": integer from the [post_id=N] label on that post',
		'- "assets": array of asset symbols or "MARKET" for broad macro',
		'- "signal_type": short category such as whale_alert, regulation, macro, sentiment',
		'- "why": must cite a specific fact/number/phrase from THAT post\'s text (not account reputation)',
		"",
		"Do NOT include summary, username, or rank on top_posts — resolved server-side.",
		"",
		"Cross-field rules:",
		`- total_retrieved must equal ${totalRetrieved}`,
		"- top_posts.length must not exceed the number of posts shown in the prompt.",
		"- At most one top_posts entry per username.",
		"- top_posts array order = most informative first.",
		"",
		"Valid example:",
		buildExampleSocialMediaAnalysis(totalRetrieved),
		"",
		"Valid example when nothing stood out:",
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
	const system = buildJsonOutputContract(totalRetrieved, promptSignals);

	const user = [
		"You are a crypto social media analyst supporting a 24-hour trading outlook.",
		"",
		"Task:",
		"1. Read all posts below and produce a bullet-point summary of the important",
		"   information for outlook assets and broad crypto/macro risk.",
		"2. List top_posts: the posts that were most informative when writing that summary.",
		"3. Optionally add themes and by_asset sentiment notes if helpful.",
		"",
		...(marketContext ? [buildMarketContextPreamble(marketContext), ""] : []),
		buildSummaryAnalysisGuidance(outlookAssets),
		"",
		buildTopPostsGuidance(promptSignals),
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
			'summary must be bullet lines starting with "- ". Order top_posts most-informative first.',
			"why must cite a concrete fact from that post's text. At most one top_posts entry per username.",
			"post_id must match [post_id=N] labels exactly — copy the integer from the prompt, not a 0-based rank.",
		].join("\n"),
	};
}
