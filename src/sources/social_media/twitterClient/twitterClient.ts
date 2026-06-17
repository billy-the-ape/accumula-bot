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
	maxAge = 0,
	// force = true,
): Promise<GetSearchScrapeResult> => {
	return await sendAndConsumeAmqp<GetSearchScrapeResult>({
		type: "twitter-search",
		subtype: "search",
		userName: searchString,
		count: pagesToScrape,
		// force,
		...(!!maxAge && { maxAge }),
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
	"nikhileshde",
	"bitcoinarchive",
	"glassnode",
];

const MACRO_ACCOUNTS = ["LynAldenContact", "TheMarketEar", "KobeissiLetter"];

const GOVERNMENT_ACCOUNTS = ["SECGov", "federalreserve", "CFTC"];

const ALL_ACCOUNTS = [
	...BUSINESS_NEWS_ACCOUNTS,
	...CRYPTO_ACCOUNTS,
	...MACRO_ACCOUNTS,
	...GOVERNMENT_ACCOUNTS,
];

export const TWITTER_ACCOUNTS_TAG_MAP = {
	business: BUSINESS_NEWS_ACCOUNTS,
	crypto: CRYPTO_ACCOUNTS,
	macro: MACRO_ACCOUNTS,
	government: GOVERNMENT_ACCOUNTS,
};

const makeDefaultSearchString = (accounts: string[]) => {
	return `(${[...accounts.map((account) => `from:${account}`)].join(" OR ")}) exclude:replies exclude:retweets`;
};

const DEFAULT_SEARCH_STRING = makeDefaultSearchString(ALL_ACCOUNTS);

interface TwitterSearchOptions {
	earliestDate?: Date | undefined;
	pagesToScrape?: number | undefined;
	searchString?: string | undefined;
	depth?: number | undefined;
	retryCount?: number | undefined;
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

export const getTwitterSearchMultipleResults = async ({
	searchStrings = [],
	...searchOptions
}: Omit<TwitterSearchOptions, "searchString" | "depth"> & {
	searchStrings?: string[];
}): Promise<TweetWithDataWeCareAbout[]> => {
	if (!searchStrings.length) {
		searchStrings.push(
			...ALL_ACCOUNTS.map((account) => makeDefaultSearchString([account])),
		);
	}
	console.info(
		"Social media - Twitter search: ",
		`Using ${searchStrings.length} search strings`,
	);

	const results = await Promise.all(
		searchStrings.map(async (searchString) => {
			return await getTwitterSearchResult({
				...searchOptions,
				searchString,
			});
		}),
	);
	const flattenedResults = results.flat();
	console.info(
		"Social media - Twitter search: ",
		`Found ${flattenedResults.length} tweets`,
	);
	return flattenedResults;
};

export const getTwitterSearchResult = async ({
	earliestDate,
	pagesToScrape: pagesToScrapeFromProps,
	searchString: searchStringFromProps,
	depth = 0,
	retryCount = 5,
}: TwitterSearchOptions): Promise<TweetWithDataWeCareAbout[]> => {
	if (depth > retryCount) {
		console.info("Social media - Twitter search: ", `Failure - depth_exceeded`);
		return [];
	}

	const earliestDateMs = earliestDate?.getTime() ?? Date.now() - DAY_MS; // 24 hours ago

	let searchString = searchStringFromProps;
	let pagesToScrape = pagesToScrapeFromProps;
	if (!searchStringFromProps || !pagesToScrapeFromProps) {
		const config = loadConfig();

		searchString =
			searchString ||
			config.socialMedia.twitterConfig.searchString ||
			DEFAULT_SEARCH_STRING;
		pagesToScrape =
			pagesToScrape || config.socialMedia.twitterConfig.searchMaxPages || 5;
	}

	if (!searchString || !pagesToScrape) {
		throw new Error("Search string and pages to scrape are required");
	}

	const maxAge = Date.now() - earliestDateMs;
	const result = await getSearchScrape(searchString, pagesToScrape, maxAge);

	if (
		(!result.success && result.message === "depth_exceeded") ||
		!result.data?.results?.length
	) {
		await sleep(1000 * (depth + 1));
		return getTwitterSearchResult({
			earliestDate,
			pagesToScrape,
			searchString,
			depth: depth + 1,
		});
	}

	const filteredResult = result.data?.results ?? [];

	if (!result.success) {
		console.info(
			"Social media - Twitter search: ",
			`Failure - ${result.message ?? "Unknown reason"}`,
			searchString,
		);
	}

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
