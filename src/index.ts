import {
	buildAnalysisContext,
	getMarketSnapshotsFromContext,
} from "@/analysis/index.js";
import { loadConfig } from "@/config/index.js";
import {
	computePortfolioBtcValue,
	computeReturnFraction,
} from "@/domain/index.js";
import {
	createPaperExecutionConfig,
	PaperExecution,
} from "@/execution/index.js";
import { buildPriceMap } from "@/execution/priceMap.js";

import { getAnalyzableAssets, runAnalysis } from "@/llm/index.js";

import { notifyTrades } from "@/notifications/telegram/index.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";
import { summarizeRecommendation } from "@/schemas/TradeRecommendation.js";

import { createDatabase } from "@/storage/db.js";

import { saveDecision } from "@/storage/repositories/decisionRepository.js";

import { getLatestPortfolio } from "@/storage/repositories/portfolioRepository.js";

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
	console.info(
		`LLM limits: context=${config.llm.contextTokens} tokens, max_output=${config.llm.maxOutputTokens} tokens`,
	);

	console.info(`Database: ${config.databasePath}`);

	console.info(`Market data: CoinGecko @ ${config.coingecko.baseUrl}`);

	if (config.telegram) {
		console.info("Telegram notifications: enabled");
	}

	const analyzableAssets = getAnalyzableAssets(config);

	console.info("Building analysis context...");

	const analysisContext = await buildAnalysisContext(config, analyzableAssets);

	const marketData = getMarketSnapshotsFromContext(analysisContext);

	console.info("Running LLM analysis...");

	const recommendation = await runAnalysis(config, analysisContext);

	const recommendationSummary = summarizeRecommendation(recommendation);

	console.info("Trade recommendation:");

	console.info(JSON.stringify(recommendation, null, 2));

	console.info(`Derived actions: ${recommendationSummary.headline}`);

	const connection = await createDatabase(config.databasePath);

	try {
		const saved = await saveDecision(connection.db, {
			assetToAccumulate: config.assetToAccumulate.symbol,

			recommendation,

			marketSnapshots: marketData,

			analysisContext,

			llm: {
				provider: config.llm.provider,

				model: config.llm.model,
			},
		});

		console.info(`Decision saved (id=${saved.id})`);

		console.info("Running paper execution...");

		const paperExecution = new PaperExecution(
			connection.db,

			createPaperExecutionConfig(config),
		);

		const execution = await paperExecution.executeRecommendation({
			recommendation,

			marketSnapshots: marketData,

			decisionId: saved.id,
		});

		if (execution.executed) {
			console.info(`Paper execution: ${execution.reason}`);

			console.info(`Trades recorded: ${execution.trades.length}`);
		} else if (execution.riskBlocked) {
			console.info(`Paper execution blocked by risk: ${execution.reason}`);
		} else {
			console.info(`Paper execution skipped: ${execution.reason}`);
		}

		const portfolio = await getLatestPortfolio(connection.db);

		if (portfolio) {
			const prices = buildPriceMap(marketData, config.assetStarting.symbol);

			const btcValue = computePortfolioBtcValue(
				portfolio.holdings,

				prices,

				config.assetToAccumulate.symbol,
			);

			const returnPct =
				computeReturnFraction(btcValue, portfolio.initialBtcBaseline) * 100;

			console.info("Portfolio holdings:", portfolio.holdings);

			console.info(
				`Portfolio ${config.assetToAccumulate.symbol} value: ${btcValue.toFixed(8)} ${config.assetToAccumulate.symbol}`,
			);

			console.info(`Return vs initial baseline: ${returnPct.toFixed(2)}%`);

			if (
				config.telegram &&
				execution.executed &&
				execution.trades.length > 0
			) {
				try {
					await notifyTrades(config.telegram, {
						trades: execution.trades,

						recommendedAsset: recommendationSummary.headline,

						reason:
							recommendation.summary ??
							recommendation.outlooks

								.map((outlook) => outlook.reason)

								.filter((reason): reason is string => Boolean(reason))

								.join(" | "),

						btcValue,

						returnPct,

						accumulateSymbol: config.assetToAccumulate.symbol,
					});

					console.info("Telegram trade notification sent");
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "unknown error";

					console.error(`Failed to send Telegram notification: ${message}`);
				}
			}
		}
	} finally {
		connection.client.close();
	}
}

main().catch((error: unknown) => {
	console.error("Failed to start:", error);

	process.exit(1);
});
