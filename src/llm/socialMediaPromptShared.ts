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
		"Decision rule (24-hour trading horizon):",
		"Include a post ONLY if it reports a NEW FACT (not commentary on an existing move)",
		`that could change positioning in ${assetList} or broad crypto risk within 24 hours.`,
		"When in doubt, exclude.",
	].join("\n");
}

function buildRelevanceFewShotExamples(): string {
	return [
		"Relevance examples (illustrative only — do NOT copy any post_id numbers from here):",
		"",
		'  INCLUDE: "@whale_alert: 15,000 BTC ($1.4B) transferred from unknown wallet to Coinbase" (concrete exchange inflow)',
		'  INCLUDE: "@DeItaone: BREAKING: Fed Chair signals no rate cut before September meeting" (new macro catalyst)',
		'  EXCLUDE: "@WatcherGuru: Bitcoin just hit $95k!" (price cheer, no new fact)',
		'  EXCLUDE: "@coinbureau: Why I\'m bullish on ETH long term" (opinion, no catalyst)',
		'  INCLUDE: "@SECGov: SEC approves spot Ethereum ETF applications" (regulatory catalyst for ETH)',
		'  EXCLUDE: "@randomtrader: Support at 92k holding, next resistance 98k" (TA chatter without new event)',
	].join("\n");
}

/** Relevance criteria for Stage 1a batch filtering (no synthesis/top_posts rules). */
export function buildRelevanceFilterGuidance(
	outlookAssets: readonly string[],
): string {
	return [
		buildRelevanceDecisionRule(outlookAssets),
		"",
		buildRelevanceFewShotExamples(),
		"",
		"Return post_id values only for posts like the INCLUDE examples — posts you would actually trade on.",
	].join("\n");
}
