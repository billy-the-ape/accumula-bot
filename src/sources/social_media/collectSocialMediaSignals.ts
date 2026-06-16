import type { AppConfig } from "@/config";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal";
import { getTwitterSearchResult } from "@/sources/social_media/twitterClient/twitterClient";

export async function collectSocialMediaSignals(
	config: AppConfig,
): Promise<SocialMediaSignal[]> {
	const tweets = await getTwitterSearchResult({
		searchString: config.socialMedia.twitterConfig.searchString,
		pagesToScrape: config.socialMedia.twitterConfig.searchMaxPages,
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
