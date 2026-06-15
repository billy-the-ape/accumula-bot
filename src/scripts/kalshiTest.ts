import { fetchKalshiSignal } from "@/sources/prediction_markets/kalshiClient";

const TEST_CONFIGS = [
	{
		asset: "ETH",
		seriesTicker: "KXETHD",
		spotPriceUsd: 1_830,
	},
	{
		asset: "SOL",
		seriesTicker: "KXSOLD",
		spotPriceUsd: 75,
	},
	{
		asset: "BTC",
		seriesTicker: "KXBTCD",
		spotPriceUsd: 66_860,
	},
];

async function kalshiTest() {
	for (const config of TEST_CONFIGS) {
		const signal = await fetchKalshiSignal(
			{ baseUrl: "https://external-api.kalshi.com/trade-api/v2" },
			{
				asset: config.asset,
				seriesTicker: config.seriesTicker,
				targetHorizonHours: 24,
				spotPriceUsd: config.spotPriceUsd,
				now: new Date(),
			},
		);

		console.info(signal);
	}
}

kalshiTest()
	.then(() => {
		console.info("Kalshi test completed");
		process.exit(0);
	})
	.catch((error) => {
		console.error("Kalshi test failed", error);
		process.exit(1);
	});
