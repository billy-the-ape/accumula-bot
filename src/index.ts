import {
	buildAnalysisContext,
	getMarketSnapshotsFromContext,
	getPredictionSignalsFromContext,
	getSocialMediaSectionFromContext,
	getSocialMediaSignalsFromContext,
} from "@/analysis/index.js";
import { loadConfig } from "@/config/index.js";
import {
	computePortfolioBtcValue,
	computeReturnFraction,
	getTotalPortfolioQuoteValue,
} from "@/domain/index.js";
import {
	createPaperExecutionConfig,
	PaperExecution,
} from "@/execution/index.js";
import { buildPriceMap } from "@/execution/priceMap.js";

import { getAnalyzableAssets, runAnalysis } from "@/llm/index.js";

import {
	notifyRun,
	notifyRunFailure,
	type RunOutcome,
} from "@/notifications/telegram/index.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";
import { summarizeRecommendation } from "@/schemas/TradeRecommendation.js";

import { createDatabase } from "@/storage/db.js";

import { saveDecision } from "@/storage/repositories/decisionRepository.js";

import { getLatestPortfolio } from "@/storage/repositories/portfolioRepository.js";
import { formatDuration } from "@/utils";

async function main() {
	const mainStart = Date.now();
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

	if (config.predictionMarkets.enabled) {
		console.info("Prediction markets: enabled");
		console.info(
			`Prediction markets: Kalshi @ ${config.predictionMarkets.kalshiBaseUrl}`,
		);
		console.info(
			`Prediction markets: Polymarket Gamma @ ${config.predictionMarkets.polymarketGammaBaseUrl}`,
		);
		console.info(
			`Prediction markets: Polymarket CLOB @ ${config.predictionMarkets.polymarketClobBaseUrl}`,
		);
		console.info(
			`Prediction markets: Target horizon: ${config.predictionMarkets.targetHorizonHours} hours`,
		);
	} else {
		console.info("Prediction markets: disabled");
	}

	if (config.socialMedia.enabled) {
		console.info("Social media: enabled");
	} else {
		console.info("Social media: disabled");
	}

	try {
		const analyzableAssets = getAnalyzableAssets(config);

		const analysisStart = Date.now();
		console.info("Building analysis context...");

		const analysisContext = await buildAnalysisContext(
			config,
			analyzableAssets,
		);

		const analysisDuration = Date.now() - analysisStart;
		console.info(
			`Analysis context built in ${formatDuration(analysisDuration)}`,
		);

		const marketData = getMarketSnapshotsFromContext(analysisContext);
		const predictionSignals = getPredictionSignalsFromContext(analysisContext);
		const socialMediaSignals =
			getSocialMediaSignalsFromContext(analysisContext);
		const socialMediaSection =
			getSocialMediaSectionFromContext(analysisContext);

		if (config.socialMedia.enabled) {
			if (socialMediaSection?.scoringStats) {
				const { fetched, newlyScored, skippedAlreadyScored } =
					socialMediaSection.scoringStats;
				console.info(
					`Social media: fetched=${fetched} newly_scored=${newlyScored} already_scored=${skippedAlreadyScored}`,
				);
				console.info(
					`Social media prompt: ${socialMediaSection.topPostsForPrompt?.length ?? 0} top posts (24h, score>=4)`,
				);
			} else if (socialMediaSignals.length > 0) {
				console.info(
					`Social media: retrieved=${socialMediaSignals.length} (scoring unavailable)`,
				);
			} else {
				console.info("Social media: no posts retrieved");
			}
		}

		const llmStart = Date.now();

		const analysis = await runAnalysis(config, analysisContext);

		const { recommendation, llm: llmAnalysis } = analysis;

		const recommendationSummary = summarizeRecommendation(recommendation);

		const llmDuration = Date.now() - llmStart;
		console.info(
			`Trade recommendation LLM analysis completed in ${formatDuration(llmDuration)}`,
		);

		if (llmAnalysis.thinking) {
			console.info(
				`Trade recommendation LLM thinking captured (${llmAnalysis.thinking.length.toLocaleString()} chars, attempt=${llmAnalysis.attempt})`,
			);
		}

		console.info("Trade recommendation:");

		console.info(JSON.stringify(recommendation, null, 2));

		console.info(`Derived actions: ${recommendationSummary.headline}`);

		const connection = await createDatabase(config.databasePath);

		try {
			// We intentionally do NOT persist the full analysis context: it grows
			// fast as data sources (social media, news) are added. The verbose
			// per-run Telegram report below is the audit trail instead.
			const saved = await saveDecision(connection.db, {
				assetToAccumulate: config.assetToAccumulate.symbol,
				recommendation,
				marketSnapshots: marketData,
				llm: {
					provider: config.llm.provider,
					model: config.llm.model,
					...(llmAnalysis.thinking ? { thinking: llmAnalysis.thinking } : {}),
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

			const outcome: RunOutcome = execution.executed
				? "executed"
				: execution.riskBlocked
					? "risk_blocked"
					: "hold";

			let portfolioReport:
				| {
						btcValue: number;
						usdValue: number;
						returnPct: number;
						usdAllTimeReturnPct: number;
				  }
				| undefined;
			const portfolio = await getLatestPortfolio(connection.db);

			if (portfolio) {
				const prices = buildPriceMap(marketData, config.assetStarting.symbol);

				const btcValue = computePortfolioBtcValue(
					portfolio.holdings,
					prices,
					config.assetToAccumulate.symbol,
				);
				const usdValue = getTotalPortfolioQuoteValue(
					portfolio.holdings,
					prices,
				);

				const returnPct =
					computeReturnFraction(btcValue, portfolio.initialBtcBaseline) * 100;
				const usdAllTimeReturnPct =
					computeReturnFraction(usdValue, portfolio.initialQuoteBaseline) * 100;

				console.info("Portfolio holdings:", portfolio.holdings);
				console.info(
					`Portfolio ${config.assetToAccumulate.symbol} value: ${btcValue.toFixed(8)} ${config.assetToAccumulate.symbol}`,
				);
				console.info(`Return vs initial baseline: ${returnPct.toFixed(2)}%`);
				console.info(
					`Portfolio USD value: ${usdValue.toFixed(2)} (${usdAllTimeReturnPct.toFixed(2)}% all-time)`,
				);

				portfolioReport = {
					btcValue,
					usdValue,
					returnPct,
					usdAllTimeReturnPct,
				};
			}

			// Always notify on a completed run — executed, blocked, or hold.
			if (portfolio && config.telegram) {
				try {
					await notifyRun(config.telegram, {
						outcome,
						portfolio,
						headline: recommendationSummary.headline,
						averageConfidence: recommendationSummary.averageConfidence,
						outlooks: recommendation.outlooks,
						summary: recommendation.summary,
						trades: execution.trades,
						executionReason: execution.reason,
						predictionSignals,
						socialMediaSignals,
						...(socialMediaSection?.topPostsForReport
							? { socialMediaTopPosts: socialMediaSection.topPostsForReport }
							: {}),
						...(socialMediaSection?.scoringStats
							? { socialMediaScoringStats: socialMediaSection.scoringStats }
							: {}),
						accumulateSymbol: config.assetToAccumulate.symbol,
						outlookThresholds: config.outlookThresholds,
						...(portfolioReport ? { portfolioReport } : {}),
					});

					console.info("Telegram run report sent");
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "unknown error";

					console.error(`Failed to send Telegram run report: ${message}`);
				}
			}
		} finally {
			connection.client.close();
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown error";

		// Surface failures to Telegram too, so every run produces a message.
		if (config.telegram) {
			try {
				await notifyRunFailure(config.telegram, message);
			} catch (notifyError) {
				const detail =
					notifyError instanceof Error ? notifyError.message : "unknown error";
				console.error(`Failed to send Telegram failure alert: ${detail}`);
			}
		}

		throw error;
	}
	return Date.now() - mainStart;
}

main()
	.then((duration) => {
		console.info(`Accumula Bot run completed in ${formatDuration(duration)}`);
		process.exit(0);
	})
	.catch((error: unknown) => {
		console.error("Failed to start:", error);

		process.exit(1);
	});
