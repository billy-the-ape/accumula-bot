import { loadConfig } from "@/config/index.js";
import { getAnalyzableAssets, runAnalysis } from "@/llm/index.js";
import { fetchMarketSnapshots } from "@/market/index.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";
import { recordDecision } from "@/storage/recordDecision.js";

async function main() {
	const config = loadConfig();

	console.info("Accumula Bot starting");
	console.info(`Asset to accumulate: ${config.assetToAccumulate.symbol}`);
	console.info(`Starting asset: ${config.assetStarting.symbol}`);
	console.info(
		`Tradeable assets: ${config.assetTradeable.map((asset: Cryptocurrency) => asset.symbol).join(", ")}`,
	);
	console.info(
		`LLM: ${config.llm.provider} / ${config.llm.model} @ ${config.llm.baseUrl}`,
	);
	console.info(`Database: ${config.databasePath}`);
	console.info(`Market data: CoinGecko @ ${config.coingecko.baseUrl}`);

	const analyzableAssets = getAnalyzableAssets(config);

	console.info("Fetching live market data...");
	const marketData = await fetchMarketSnapshots(analyzableAssets, {
		baseUrl: config.coingecko.baseUrl,
		...(config.coingecko.apiKey ? { apiKey: config.coingecko.apiKey } : {}),
	});

	console.info("Running LLM analysis...");
	const recommendation = await runAnalysis(config, marketData);

	console.info("Trade recommendation:");
	console.info(JSON.stringify(recommendation, null, 2));

	const saved = await recordDecision(config.databasePath, {
		assetToAccumulate: config.assetToAccumulate.symbol,
		recommendation,
		marketSnapshots: marketData,
		llm: {
			provider: config.llm.provider,
			model: config.llm.model,
		},
	});

	console.info(`Decision saved (id=${saved.id})`);
}

main().catch((error: unknown) => {
	console.error("Failed to start:", error);
	process.exit(1);
});
