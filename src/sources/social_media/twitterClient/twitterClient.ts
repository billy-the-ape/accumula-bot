import { promises } from "node:fs";
import { loadConfig } from "@/config";
import { sendAndConsumeAmqp } from "@/sources/social_media/twitterClient/amqpProducer.js";
import type { TweetForDb } from "@/sources/social_media/twitterClient/types.js";
import { DAY_MS, sleep } from "@/utils";

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

const BUSINESS_NEWS_ACCOUNTS = [
	"DeItaone",
	"financialjuice",
	"ReutersBiz",
	"CNBC",
	"WSJ",
	"FT",
	"NYTimes",
];

const CRYPTO_ACCOUNTS = [
	"unusual_whales",
	"whale_alert",
	"MessariCrypto",
	"WatcherGuru",
	"BloombergCrypto",
	"CoinDesk",
	"Cointelegraph",
	"coinbureau",
	"tier10k",
	"TheBlockCo",
	"DefiIgnas",
];

const MACRO_ACCOUNTS = ["LynAldenContact", "TheMarketEar", "KobeissiLetter"];

const GOVERNMENT_ACCOUNTS = ["SECGov", "federalreserve", "CFTC"];

export const TWITTER_ACCOUNTS_TAG_MAP = {
	business: BUSINESS_NEWS_ACCOUNTS,
	crypto: CRYPTO_ACCOUNTS,
	macro: MACRO_ACCOUNTS,
	government: GOVERNMENT_ACCOUNTS,
};

// Ideally these accounts are posting market news without any bias
const DEFAULT_ACCOUNTS_SEARCH_STRING = `(${[
	...[
		...BUSINESS_NEWS_ACCOUNTS,
		...CRYPTO_ACCOUNTS,
		...MACRO_ACCOUNTS,
		...GOVERNMENT_ACCOUNTS,
	].map((account) => `from:${account}`),
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
	depth?: number | undefined;
}

interface TweetWithDataWeCareAbout {
	index: number;
	id: string;
	username: string;
	tweetedDate: number;
	fullText: string;
	views: {
		count: string;
		state: string;
	};
}

export const getTwitterSearchResult = async ({
	earliestDate,
	pagesToScrape: pagesToScrapeFromProps,
	searchString: searchStringFromProps,
	depth = 0,
}: TwitterSearchOptions): Promise<TweetWithDataWeCareAbout[]> => {
	if (depth > 4) {
		console.info("Social media - Twitter search: ", `Failure - depth_exceeded`);
		return [];
	}

	const earliestDateMs = earliestDate?.getTime() ?? Date.now() - DAY_MS; // 24 hours ago

	let searchString = searchStringFromProps;
	let pagesToScrape = pagesToScrapeFromProps;
	if (!searchStringFromProps || !pagesToScrapeFromProps) {
		const config = loadConfig();

		searchString =
			searchString || config.socialMedia.twitterConfig.searchString;
		pagesToScrape =
			pagesToScrape || config.socialMedia.twitterConfig.searchMaxPages;
	}

	console.info(
		"Social media - Twitter search: ",
		`${searchString?.slice(0, 20)}...`,
	);
	console.info(
		"Social media - Twitter search: ",
		`pagesToScrape: ${pagesToScrape}`,
	);
	console.info(
		"Social media - Twitter search: ",
		`earliestDate: ${new Date(earliestDateMs).toISOString()}`,
	);

	const result = await getSearchScrape(
		searchString || DEFAULT_SEARCH_STRING,
		pagesToScrape || 10,
	);

	if (!result.success && result.message === "depth_exceeded") {
		await sleep(1000 * (depth + 1));
		return getTwitterSearchResult({
			earliestDate,
			pagesToScrape,
			searchString,
			depth: depth + 1,
		});
	}

	const filteredResult =
		result.data?.results?.filter(
			(tweet) => tweet.tweetedDate >= earliestDateMs,
		) ?? [];

	console.info(
		"Social media - Twitter search: ",
		result.success
			? "Success"
			: `Failure - ${result.message ?? "Unknown reason"}`,
		`Result count: ${filteredResult.length}`,
	);

	const finalResult = filteredResult.map((tweet, index) => ({
		index,
		id: tweet.id,
		username: tweet.user,
		tweetedDate: tweet.tweetedDate,
		fullText: tweet.fullText,
		views: tweet.views ?? { count: "0", state: "Disabled" },
	}));

	if (process.env.NODE_ENV !== "production") {
		await promises.writeFile(
			`./temp/twitterSearchResult_${new Date().toISOString().replace(/:/g, "-").split(".")[0]}.json`,
			JSON.stringify(finalResult, null, 2),
		);
	}

	return finalResult;
};
