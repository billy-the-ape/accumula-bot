import { sendAndConsumeAmqp } from "@/sources/social_media/twitterClient/amqpProducer.js";
import type { TweetForDb } from "@/sources/social_media/twitterClient/types.js";

export interface GetSearchScrapeResult {
	success: boolean;
	message?: string;
	data?: { tweets?: Array<TweetForDb> };
}

export const getSearchScrape = async (
	searchString: string,
	pagesToScrape = 1,
): Promise<GetSearchScrapeResult> => {
	return await sendAndConsumeAmqp<{
		success: boolean;
		message?: string;
		data?: { tweets?: Array<TweetForDb> };
	}>({
		type: "twitter-search",
		subtype: "search",
		userName: searchString,
		count: pagesToScrape,
	});
};
