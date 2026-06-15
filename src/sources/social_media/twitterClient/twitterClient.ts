import { loadConfig } from "@/config";
import { sendAndConsumeAmqp } from "@/sources/social_media/twitterClient/amqpProducer.js";
import type { TweetForDb } from "@/sources/social_media/twitterClient/types.js";

const config = loadConfig();

export interface GetSearchScrapeResult {
	success: boolean;
	message?: string;
	data?: { tweets?: Array<TweetForDb> };
}

export const getSearchScrape = async (
	searchString: string,
	pagesToScrape = 1,
	force = true,
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
		force,
	});
};

const DEFAULT_ACCOUNTS_SEARCH_STRING = `(${[
	"from:DocumentingBTC",
	"from:BTC_archive",
	"from:saylor",
	"from:vitalikbuterin",
	"from:unusual_whales",
	"from:MessariCrypto",
	"from:WatcherGuru",
	"from:CoinDesk",
	"from:Cointelegraph",
	"from:coinbureau",
	"from:CNBC",
	"from:BloombergCrypto",
	"from:WSJ",
	"from:FT",
	"from:NYTimes",
].join(" OR ")})`;

const DEFAULT_SEARCH_STRING = [
	DEFAULT_ACCOUNTS_SEARCH_STRING,
	"-is:reply",
	"-is:retweet",
].join(" ");

interface TwitterSearchOptions {
	earliestDate?: Date;
	pagesToScrape?: number;
	searchString?: string;
}

export const getTwitterSearchResult = async ({
	earliestDate,
	pagesToScrape = config.twitter.searchMaxPages,
	searchString = config.twitter.searchString,
}: TwitterSearchOptions) => {
	const earliestDateMs =
		earliestDate?.getTime() ?? Date.now() - 1000 * 60 * 60 * 24; // 24 hours ago

	const result = await getSearchScrape(
		searchString ?? DEFAULT_SEARCH_STRING,
		pagesToScrape ?? 10,
	);

	return (
		result.data?.tweets?.filter(
			(tweet) => tweet.tweetedDate >= earliestDateMs,
		) ?? []
	);
};
