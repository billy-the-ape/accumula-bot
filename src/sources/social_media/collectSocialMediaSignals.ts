import type { AppConfig } from "@/config";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal";
import { SOCIAL_MEDIA_FETCH_WINDOW_MS } from "@/sources/social_media/socialMediaScoringConstants.js";
import { getTwitterSearchMultipleResults } from "@/sources/social_media/twitterClient/twitterClient";

export type CollectSocialMediaSignalsOptions = {
	fetchWindowMs?: number;
};

export async function collectSocialMediaSignals(
	config: AppConfig,
	options: CollectSocialMediaSignalsOptions = {},
): Promise<SocialMediaSignal[]> {
	const fetchWindowMs = options.fetchWindowMs ?? SOCIAL_MEDIA_FETCH_WINDOW_MS;
	const earliestDate = new Date(Date.now() - fetchWindowMs);

	const tweets = await getTwitterSearchMultipleResults({
		searchStrings: config.socialMedia.twitterConfig.searchString
			? [config.socialMedia.twitterConfig.searchString]
			: [],
		pagesToScrape: config.socialMedia.twitterConfig.searchMaxPages,
		earliestDate,
	});

	return tweets.map<SocialMediaSignal>((tweet) => ({
		index: tweet.index,
		id: tweet.id,
		source: "twitter",
		username: tweet.username,
		text: tweet.fullText,
		asOf: new Date(tweet.tweetedDate).toISOString(),
		impressions: Number(tweet.views?.count ?? 0),
	}));
}
