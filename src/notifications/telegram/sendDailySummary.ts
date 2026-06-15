import type { AppConfig } from "@/config/appConfigSchema.js";
import {
	computePortfolioBtcValue,
	computeReturnFraction,
	getTotalPortfolioQuoteValue,
} from "@/domain/index.js";
import { buildPriceMap } from "@/execution/priceMap.js";
import { getAnalyzableAssets } from "@/llm/index.js";
import { formatDailySummary } from "@/notifications/telegram/formatDailySummary.js";
import { sendTelegramMessage } from "@/notifications/telegram/telegramClient.js";
import { fetchMarketSnapshots } from "@/sources/market/index.js";
import type { AppDatabase } from "@/storage/db.js";
import { getLatestPortfolio } from "@/storage/repositories/portfolioRepository.js";
import { listTradesSince } from "@/storage/repositories/tradeRepository.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function sendDailySummary(
	config: AppConfig,
	db: AppDatabase,
	options: { fetchImpl?: typeof fetch } = {},
): Promise<void> {
	if (!config.telegram) {
		throw new Error("Telegram is not configured");
	}

	const portfolio = await getLatestPortfolio(db);
	if (!portfolio) {
		throw new Error("No portfolio found — run the bot at least once first");
	}

	const analyzableAssets = getAnalyzableAssets(config);
	const marketData = await fetchMarketSnapshots(analyzableAssets, {
		baseUrl: config.coingecko.baseUrl,
		...(config.coingecko.apiKey ? { apiKey: config.coingecko.apiKey } : {}),
		...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
	});

	const prices = buildPriceMap(marketData, config.assetStarting.symbol);
	const btcValue = computePortfolioBtcValue(
		portfolio.holdings,
		prices,
		config.assetToAccumulate.symbol,
	);
	const usdValue = getTotalPortfolioQuoteValue(portfolio.holdings, prices);

	const since = new Date(Date.now() - DAY_MS);
	const tradesLast24h = await listTradesSince(db, portfolio.id, since);

	const text = formatDailySummary({
		tradesLast24h,
		btcValue,
		usdValue,
		startingBtcValue: portfolio.initialBtcBaseline,
		startingUsdValue: portfolio.initialQuoteBaseline,
		accumulateSymbol: config.assetToAccumulate.symbol,
		dailyReturnPct:
			computeReturnFraction(btcValue, portfolio.dailyBaselineBtcValue) * 100,
		weeklyReturnPct:
			computeReturnFraction(btcValue, portfolio.weeklyBaselineBtcValue) * 100,
		allTimeReturnPct:
			computeReturnFraction(btcValue, portfolio.initialBtcBaseline) * 100,
		holdings: portfolio.holdings,
	});

	await sendTelegramMessage(
		{
			botToken: config.telegram.botToken,
			chatId: config.telegram.chatId,
			...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
		},
		text,
	);
}
