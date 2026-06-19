import {
	CRYPTOCURRENCY_REGISTRY,
	isKnownCryptocurrencySymbol,
} from "@/config/assets.js";
import { isStablecoin } from "@/domain";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { TWITTER_ACCOUNTS_TAG_MAP } from "@/sources/social_media/twitterClient/twitterClient.js";

const PRIORITY_ACCOUNT_TAGS = ["macro"] as const;

const CATALYST_KEYWORD_PATTERN =
	/\b(etf|cpi|ppi|fomc|fed|rate|sec|cftc|hack|exploit|insolv|bankrupt|delist|liquidat|inflow|outflow|treasury|sanction|regulat|enforcement|subpoena|approv|denied|outage|halt|suspend|whale|transfer|btc|eth|sol|bitcoin|market|oil|war|peace|sanction)/i;

const PRIORITY_ACCOUNTS = new Set(
	PRIORITY_ACCOUNT_TAGS.flatMap((tag) =>
		TWITTER_ACCOUNTS_TAG_MAP[tag].map((account) => account.toLowerCase()),
	),
);

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildOutlookAssetPattern(
	outlookAssets: readonly string[],
): RegExp | undefined {
	const terms: string[] = [];

	for (const symbol of outlookAssets) {
		terms.push(`\\b#?\\$?${escapeRegExp(symbol)}\\b`);
		if (isKnownCryptocurrencySymbol(symbol)) {
			const data = CRYPTOCURRENCY_REGISTRY[symbol];
			if (!isStablecoin(data)) {
				terms.push(
					`\\b#?${escapeRegExp(CRYPTOCURRENCY_REGISTRY[symbol].name)}\\b`,
				);
			}
		}
	}

	if (terms.length === 0) {
		return undefined;
	}

	return new RegExp(terms.join("|"), "i");
}

export type PrefilterSocialMediaSignalsResult = {
	candidates: SocialMediaSignal[];
	excludedCount: number;
};

export function prefilterSocialMediaSignalsForRelevance(
	signals: readonly SocialMediaSignal[],
	outlookAssets: readonly string[],
): PrefilterSocialMediaSignalsResult {
	const assetPattern = buildOutlookAssetPattern(outlookAssets);
	const candidates: SocialMediaSignal[] = [];

	for (const signal of signals) {
		if (PRIORITY_ACCOUNTS.has(signal.username.toLowerCase())) {
			candidates.push(signal);
			continue;
		}

		if (assetPattern?.test(signal.text)) {
			candidates.push(signal);
			continue;
		}

		if (CATALYST_KEYWORD_PATTERN.test(signal.text)) {
			candidates.push(signal);
		}
	}

	return {
		candidates,
		excludedCount: signals.length - candidates.length,
	};
}
