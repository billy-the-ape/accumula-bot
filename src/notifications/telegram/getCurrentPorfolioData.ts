import type { AppConfig } from "@/config";
import {
	computePortfolioAccumulateValue,
	computeReturnFraction,
	getTotalPortfolioQuoteValue,
} from "@/domain";
import { buildPriceMap } from "@/execution";
import { fetchMarketSnapshotsForConfig } from "@/notifications/telegram/buildPortfolioSummaryInput.js";
import type { MarketSnapshot } from "@/schemas/MarketSnapshot.js";
import type { AppDatabase } from "@/storage";
import type { StoredPortfolio } from "@/storage/repositories/portfolioRepository.js";
import { listTradesSince } from "@/storage/repositories/tradeRepository";
import { DAY_MS } from "@/utils";

export type GetCurrentPortfolioDataOptions = {
	fetchImpl?: typeof fetch;
	marketSnapshots?: readonly MarketSnapshot[];
};

export async function getCurrentPortfolioData(
	config: AppConfig,
	db: AppDatabase,
	portfolio: StoredPortfolio,
	options: GetCurrentPortfolioDataOptions = {},
) {
	const marketData =
		options.marketSnapshots ??
		(await fetchMarketSnapshotsForConfig(config, options));

	const accumulateSymbol = portfolio.assetToAccumulate;
	const prices = buildPriceMap(marketData, config.assetStarting.symbol, {
		accumulateSymbol,
	});
	const accumulateValue = computePortfolioAccumulateValue(
		portfolio.holdings,
		prices,
		accumulateSymbol,
	);
	const usdValue = getTotalPortfolioQuoteValue(portfolio.holdings, prices);

	const since = new Date(Date.now() - DAY_MS);
	const tradesLast24h = await listTradesSince(db, portfolio.id, since);

	return {
		portfolio,
		tradesLast24h,
		btcValue: accumulateValue,
		usdValue,
		prices,
		marketData,
		accumulateSymbol,
		dailyReturnPct:
			computeReturnFraction(accumulateValue, portfolio.dailyBaselineBtcValue) *
			100,
		weeklyReturnPct:
			computeReturnFraction(accumulateValue, portfolio.weeklyBaselineBtcValue) *
			100,
		allTimeReturnPct:
			computeReturnFraction(accumulateValue, portfolio.initialBtcBaseline) *
			100,
	};
}
