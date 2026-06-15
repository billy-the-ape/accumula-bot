import { getTwitterSearchResult } from "@/sources/social_media/twitterClient/twitterClient";

async function twitterSearchTest() {
	const result = await getTwitterSearchResult({
		searchString: "(from:unusual_whales OR from:FT) -is:reply -is:retweet",
		pagesToScrape: 1,
	});
	console.info({
		length: result.length,
		first: result[0],
	});
}

twitterSearchTest()
	.then(() => {
		console.info("Twitter search test completed");
		process.exit(0);
	})
	.catch((error) => {
		console.error("Twitter search test failed", error);
		process.exit(1);
	});
