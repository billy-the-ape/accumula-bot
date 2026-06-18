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

function buildRelevanceDecisionRule(outlookAssets: readonly string[]): string {
	const assetList = buildOutlookAssetListWithAliases(outlookAssets);

	return [
		"Relevance rule (24-hour trading horizon):",
		"Count a post toward relevant_count when a desk would note it for",
		`${assetList} positioning or broad crypto/macro risk within 24 hours.`,
		"",
		"Include as relevant (medium or high):",
		"- Breaking or developing headlines from wire, regulatory, or official sources",
		"- Fresh facts: flows, macro prints, policy, enforcement, hacks, listings, outages",
		"- Credible new reporting even if the broader theme is already known",
		"- Posts from the monitored accounts below reporting news — not just opinion",
		"",
		"Exclude only clear noise:",
		"- Pure price cheer, memes, promos, podcasts, or TA levels with no new event",
		"",
		"Tiering:",
		"- relevant_count = posts worth noting (medium OR high relevance)",
		"- top_posts = highest-impact subset only (relevance=high preferred; medium if thin)",
		"- When borderline, include as medium rather than exclude",
		"- relevant_count=0 should be rare for this curated feed — reserve for all-noise batches",
	].join("\n");
}

function buildRelevanceFewShotExamples(): string {
	return [
		"Examples (illustrative — do NOT copy post_id numbers):",
		"",
		'  HIGH: "@whale_alert: 15,000 BTC transferred to Coinbase" (concrete flow)',
		'  HIGH: "@SECGov: SEC approves spot Ethereum ETF applications" (regulatory catalyst)',
		'  MEDIUM: "@DeItaone: Fed speaker reiterates higher-for-longer stance" (macro tone, worth noting)',
		'  MEDIUM: "@ReutersBiz: Bitcoin steady as traders await CPI" (developing macro context)',
		'  EXCLUDE: "@random: LFG moon soon" (no fact)',
		'  EXCLUDE: "@random: Support at 92k holding" (TA without catalyst)',
	].join("\n");
}

/** Relevance guidance for the unified social media analysis prompt. */
export function buildAnalysisRelevanceGuidance(
	outlookAssets: readonly string[],
): string {
	return [
		buildRelevanceDecisionRule(outlookAssets),
		"",
		buildRelevanceFewShotExamples(),
	].join("\n");
}
