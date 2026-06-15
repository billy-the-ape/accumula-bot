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

	const signals = tweets.map<SocialMediaSignal>((tweet) => ({
		source: "twitter",
		username: tweet.user,
		text: tweet.fullText,
		asOf: new Date(tweet.tweetedDate).toISOString(),
		impressions: Number(tweet.views?.count ?? 0),
	}));

	return signals;
}
