import type { AppConfig } from "@/config";
import {
	computePortfolioBtcValue,
	computeReturnFraction,
	getTotalPortfolioQuoteValue,
} from "@/domain";
import { buildPriceMap } from "@/execution";
import { getAnalyzableAssets } from "@/llm";
import { fetchMarketSnapshots } from "@/sources/market";
import { type AppDatabase, getLatestPortfolio } from "@/storage";
import { listTradesSince } from "@/storage/repositories/tradeRepository";
import { DAY_MS } from "@/utils";

export async function getCurrentPortfolioData(
	config: AppConfig,
	db: AppDatabase,
	options: { fetchImpl?: typeof fetch } = {},
) {
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

	return {
		portfolio,
		tradesLast24h,
		btcValue,
		usdValue,
		prices,
		analyzableAssets,
		marketData,
		dailyReturnPct:
			computeReturnFraction(btcValue, portfolio.dailyBaselineBtcValue) * 100,
		weeklyReturnPct:
			computeReturnFraction(btcValue, portfolio.weeklyBaselineBtcValue) * 100,
		allTimeReturnPct:
			computeReturnFraction(btcValue, portfolio.initialBtcBaseline) * 100,
	};
}
