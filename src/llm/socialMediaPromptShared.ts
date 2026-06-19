import {
	CRYPTOCURRENCY_REGISTRY,
	isKnownCryptocurrencySymbol,
} from "@/config/assets.js";
import { stripMarkdownLinksForPrompt } from "@/macro/macroBriefingContent.js";

export type SocialMediaMarketContext = {
	content: string;
	generatedAt: Date;
};

export function buildMarketContextPreamble(
	marketContext: SocialMediaMarketContext,
): string {
	return [
		`Market context (desk briefing generated ${marketContext.generatedAt.toISOString()};):`,
		stripMarkdownLinksForPrompt(marketContext.content),
		"",
		"End of market context.",
		"Use this as background when reading the social posts below.",
		"It may be incomplete or outdated — posts are the primary evidence.",
		"If a post contradicts the briefing, prefer the post when it reports a concrete new fact.",
	].join("\n");
}

export function buildOutlookAssetListWithAliases(
	outlookAssets: readonly string[],
): string {
	return outlookAssets
		.map((symbol) => {
			if (isKnownCryptocurrencySymbol(symbol)) {
				return `${symbol} (${CRYPTOCURRENCY_REGISTRY[symbol].name})`;
			}
			return symbol;
		})
		.join(", ");
}

/** Guidance for summary-first social media analysis. */
export function buildSummaryAnalysisGuidance(
	outlookAssets: readonly string[],
): string {
	const assetList = buildOutlookAssetListWithAliases(outlookAssets);

	return [
		"Summary focus:",
		`Distill the important facts for a 24-hour outlook on ${assetList} and broad crypto/macro risk.`,
		"Prioritize breaking headlines, flows, policy, macro prints, and credible wire reporting.",
		"Skip memes, promos, pure price cheer, and TA chatter with no new information.",
		"",
		"summary format:",
		'- "summary" must be a bullet list: one fact per line, each line starting with "- "',
		"- Merge duplicate stories; do not repeat the same fact in multiple bullets",
		"- Include macro and crypto-specific items that matter for near-term positioning",
		"",
		"top_posts format:",
		"- List the posts that were most informative when writing the summary",
		"- Rank by contribution to the summary (1 = most informative)",
		"- Include at most one post per username",
		"- Prefer posts with concrete new facts (flows, data, policy, hacks) over repetitive wire headlines",
		'- "why" must cite a specific fact, number, or phrase from THAT post\'s text',
		'- Do NOT justify picks with account reputation (e.g. "trusted source", "wire headline")',
		"- Only include posts actually shown in the prompt; never invent post_id values",
	].join("\n");
}
