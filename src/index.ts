import { loadConfig } from "@/config/index.js";
import {
	createSampleMarketSnapshots,
	getAnalyzableAssets,
	runAnalysis,
} from "@/llm/index.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";

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

	const analyzableAssets = getAnalyzableAssets(config);
	const marketData = createSampleMarketSnapshots(analyzableAssets);

	console.info("Running LLM analysis with sample market data...");
	const recommendation = await runAnalysis(config, marketData);

	console.info("Trade recommendation:");
	console.info(JSON.stringify(recommendation, null, 2));
}

main().catch((error: unknown) => {
	console.error("Failed to start:", error);
	process.exit(1);
});
