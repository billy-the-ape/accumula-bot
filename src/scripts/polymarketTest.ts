import { fetchPolymarketSignal } from "@/sources/prediction_markets/polymarketClient";

// Discovery is via Gamma `/events` (tag `crypto`) + title prefix; `spotPriceUsd`
// selects the at-the-money rung from the "<Asset> above ___ on <date>?" ladder.
// Set spot to the real current price before running.
const TEST_CONFIGS = [
	{
		asset: "BTC",
		event: { tagSlug: "crypto", titlePrefix: "bitcoin above" },
		spotPriceUsd: 66_790,
	},
	{
		asset: "ETH",
		event: { tagSlug: "crypto", titlePrefix: "ethereum above" },
		spotPriceUsd: 1_829,
	},
	{
		asset: "SOL",
		event: { tagSlug: "crypto", titlePrefix: "solana above" },
		spotPriceUsd: 75,
	},
];

async function polymarketTest() {
	for (const config of TEST_CONFIGS) {
		const signal = await fetchPolymarketSignal(
			{
				gammaBaseUrl: "https://gamma-api.polymarket.com",
				clobBaseUrl: "https://clob.polymarket.com",
			},
			{
				...config,
				targetHorizonHours: 24,
				now: new Date(),
			},
		);

		console.info(signal);
	}
}

polymarketTest()
	.then(() => {
		console.info("Polymarket test completed");
		process.exit(0);
	})
	.catch((error) => {
		console.error("Polymarket test failed", error);
		process.exit(1);
	});
