import { stripMarkdownLinksForPrompt } from "@/macro/macroBriefingContent.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";

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

export function buildPostIndexCatalog(
	promptSignals: readonly Pick<
		SocialMediaSignal,
		"index" | "username" | "text"
	>[],
): string {
	return promptSignals
		.map(
			(signal) =>
				`${signal.index} → @${signal.username}: ${signal.text.slice(0, 80)}${signal.text.length > 80 ? "…" : ""}`,
		)
		.join("\n");
}

/** Relevance criteria for Stage 1a batch filtering (no synthesis/top_posts rules). */
export function buildRelevanceFilterGuidance(
	outlookAssets: readonly string[],
): string {
	const assetList = outlookAssets.join(", ");

	return [
		"Relevance bar (24-hour trading horizon):",
		"- Include ONLY posts that could plausibly change near-term positioning for",
		`  ${assetList} or broad crypto risk appetite within 24 hours.`,
		"- A post qualifies only if it reports a concrete, new catalyst — not vibes.",
		"",
		"Strong signals:",
		"- Large on-chain / exchange flows, ETF or treasury flows, liquidation cascades",
		"- New regulation, enforcement, policy, or major legal outcomes",
		"- Macro prints or central-bank / fiscal news with clear risk-on/risk-off read",
		"- Credible breaking news on hacks, insolvencies, exchange outages, delistings",
		"- Official or first-source announcements affecting an outlook asset",
		"- World or US news events with market-moving potential",
		"",
		"Usually NOT relevant — even if crypto-related:",
		"- Generic price cheer, hopium, bear memes, or recap threads without new facts",
		"- Vague technical analysis with no new catalyst (support/resistance chatter)",
		"- Old news, rehashed headlines, or commentary on moves that already happened",
		"- Personal takes, podcasts, newsletters, or engagement bait without a fact",
		"- Politics, culture war, or celebrity posts unless they announce concrete policy",
		"- Promotions, referral links, airdrops, NFT mints, or product marketing",
		"- Posts about unrelated assets with no read-through to the outlook assets",
		"",
		"Filtering rules:",
		"- Return post_index values only for posts you would actually trade on.",
		"- When in doubt, exclude — an empty array is correct when nothing clears the bar.",
		"- High impressions alone do NOT make a post relevant.",
	].join("\n");
}
