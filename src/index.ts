import {
	buildAnalysisContext,
	getMarketSnapshotsFromContext,
	getPredictionSignalsFromContext,
	getSocialMediaSectionFromContext,
} from "@/analysis/index.js";
import { isUsdStablecoinSymbol } from "@/config/assets.js";
import { loadConfig } from "@/config/index.js";

import { executeActivePortfolios } from "@/execution/executeActivePortfolios.js";

import { getAnalyzableAssets, runAnalysis } from "@/llm/index.js";

import {
	notifyCompactTrades,
	notifyRun,
	notifyRunFailure,
} from "@/notifications/telegram/index.js";

import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";

import { summarizeRecommendation } from "@/schemas/TradeRecommendation.js";

import { createDatabase } from "@/storage/db.js";

import { saveDecision } from "@/storage/repositories/decisionRepository.js";

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

		if (config.telegram.chatId) {
			console.info("Telegram admin mirror: enabled");
		}
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
			const saved = await saveDecision(connection.db, {
				assetToAccumulate: config.assetToAccumulate.symbol,

				recommendation,

				marketSnapshots: marketData,

				analysisContext,

				llm: {
					provider: config.llm.provider,

					model: config.llm.model,

					...(llmAnalysis.thinking ? { thinking: llmAnalysis.thinking } : {}),
				},
			});

			console.info(`Decision saved (id=${saved.id})`);

			console.info("Running execution for active portfolios...");

			const portfolioRuns = await executeActivePortfolios(
				connection.db,

				config,

				{
					recommendation,

					marketSnapshots: marketData,

					decisionId: saved.id,
				},
			);

			if (portfolioRuns.length === 0) {
				console.info("No active portfolios — execution skipped");
			}

			for (const run of portfolioRuns) {
				const { portfolio, execution, outcome, portfolioReport } = run;

				if (execution.executed) {
					console.info(
						`Portfolio ${portfolio.id} (chat ${portfolio.telegramChatId}): ${execution.reason}`,
					);

					console.info(`Trades recorded: ${execution.trades.length}`);
				} else if (execution.riskBlocked) {
					console.info(
						`Portfolio ${portfolio.id} blocked by risk: ${execution.reason}`,
					);
				} else {
					console.info(
						`Portfolio ${portfolio.id} skipped: ${execution.reason}`,
					);
				}

				console.info("Portfolio holdings:", portfolio.holdings);

				if (isUsdStablecoinSymbol(portfolio.assetToAccumulate)) {
					console.info(
						`Portfolio USD value: ${portfolioReport.usdValue.toFixed(2)} (${portfolioReport.usdAllTimeReturnPct.toFixed(2)}% all-time)`,
					);
				} else {
					console.info(
						`Portfolio ${portfolio.assetToAccumulate} value: ${portfolioReport.btcValue.toFixed(8)} ${portfolio.assetToAccumulate}`,
					);

					console.info(
						`Return vs initial baseline: ${portfolioReport.returnPct.toFixed(2)}%`,
					);

					console.info(
						`Portfolio USD value: ${portfolioReport.usdValue.toFixed(2)} (${portfolioReport.usdAllTimeReturnPct.toFixed(2)}% all-time)`,
					);
				}

				if (!config.telegram?.botToken) {
					continue;
				}

				const reportInput = {
					decisionId: saved.id,
					decisionCreatedAt: saved.createdAt,
					userDateTimeSettings: portfolio.userDateTimeSettings,

					outcome,

					portfolio,

					headline: recommendationSummary.headline,

					averageConfidence: recommendationSummary.averageConfidence,

					outlooks: recommendation.outlooks,

					summary: recommendation.summary,

					trades: execution.trades,

					executionReason: execution.reason,

					predictionSignals,

					...(socialMediaSection?.topPostsForReport
						? { socialMediaTopPosts: socialMediaSection.topPostsForReport }
						: {}),

					...(socialMediaSection?.scoringStats
						? { socialMediaScoringStats: socialMediaSection.scoringStats }
						: {}),

					accumulateSymbol: portfolio.assetToAccumulate,

					outlookThresholds: run.effectiveOutlookThresholds,

					portfolioReport,
				};

				try {
					const adminChatId = config.telegram.chatId;
					const userVerbose = portfolio.verbose;

					if (!userVerbose) {
						if (execution.trades.length === 0) {
							if (adminChatId && adminChatId !== portfolio.telegramChatId) {
								await notifyRun(
									config.telegram.botToken,
									adminChatId,
									reportInput,
								);
								console.info(
									`Telegram run report mirrored to admin chat ${adminChatId}`,
								);
							}
							continue;
						}

						await notifyCompactTrades(
							config.telegram.botToken,
							portfolio.telegramChatId,
							execution.trades,
							saved.id,
						);
						console.info(
							`Telegram compact trade report sent to chat ${portfolio.telegramChatId}`,
						);

						if (adminChatId && adminChatId !== portfolio.telegramChatId) {
							await notifyRun(
								config.telegram.botToken,
								adminChatId,
								reportInput,
							);
							console.info(
								`Telegram run report mirrored to admin chat ${adminChatId}`,
							);
						}
						continue;
					}

					await notifyRun(
						config.telegram.botToken,

						portfolio.telegramChatId,

						reportInput,
					);

					console.info(
						`Telegram run report sent to chat ${portfolio.telegramChatId}`,
					);

					if (adminChatId && adminChatId !== portfolio.telegramChatId) {
						await notifyRun(config.telegram.botToken, adminChatId, reportInput);

						console.info(
							`Telegram run report mirrored to admin chat ${adminChatId}`,
						);
					}
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "unknown error";

					console.error(
						`Failed to send Telegram run report to chat ${portfolio.telegramChatId}: ${message}`,
					);
				}
			}
		} finally {
			connection.client.close();
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown error";

		if (config.telegram?.botToken && config.telegram.chatId) {
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
