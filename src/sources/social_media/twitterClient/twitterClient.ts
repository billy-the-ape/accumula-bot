import { promises } from "node:fs";
import { loadConfig } from "@/config";
import { sendAndConsumeAmqp } from "@/sources/social_media/twitterClient/amqpProducer.js";
import type { TweetForDb } from "@/sources/social_media/twitterClient/types.js";

export interface GetSearchScrapeResult {
	success: boolean;
	message?: string;
	data?: { results?: Array<TweetForDb> };
}

export const getSearchScrape = async (
	searchString: string,
	pagesToScrape = 1,
	force = true,
): Promise<GetSearchScrapeResult> => {
	return await sendAndConsumeAmqp<GetSearchScrapeResult>({
		type: "twitter-search",
		subtype: "search",
		userName: searchString,
		count: pagesToScrape,
		force,
	});
};

// Ideally these accounts are posting market news without any bias
const DEFAULT_ACCOUNTS_SEARCH_STRING = `(${[
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
	earliestDate?: Date | undefined;
	pagesToScrape?: number | undefined;
	searchString?: string | undefined;
}

export const getTwitterSearchResult = async ({
	earliestDate,
	pagesToScrape: pagesToScrapeFromProps,
	searchString: searchStringFromProps,
}: TwitterSearchOptions) => {
	const earliestDateMs =
		earliestDate?.getTime() ?? Date.now() - 1000 * 60 * 60 * 24; // 24 hours ago

	let searchString = searchStringFromProps;
	let pagesToScrape = pagesToScrapeFromProps;
	if (!searchStringFromProps || !pagesToScrapeFromProps) {
		const config = loadConfig();

		searchString =
			searchString || config.socialMedia.twitterConfig.searchString;
		pagesToScrape =
			pagesToScrape || config.socialMedia.twitterConfig.searchMaxPages;
	}

	const result = await getSearchScrape(
		searchString || DEFAULT_SEARCH_STRING,
		pagesToScrape || 10,
	);

	await promises.writeFile(
		"./temp/twitterSearchResult.json",
		JSON.stringify(result, null, 2),
	);

	return (
		result.data?.results?.filter(
			(tweet) => tweet.tweetedDate >= earliestDateMs,
		) ?? []
	);
};
