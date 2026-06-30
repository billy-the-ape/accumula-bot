import type { AppConfig } from "@/config/appConfigSchema.js";
import {
	computePortfolioAccumulateValue,
	computeReturnFraction,
} from "@/domain/accumulateBenchmark.js";
import { getTotalPortfolioQuoteValue } from "@/domain/allocation.js";
import { buildPriceMap } from "@/execution/priceMap.js";
import { getAnalyzableAssets } from "@/llm/index.js";
import type { PortfolioSummaryInput } from "@/notifications/telegram/bot/formatPortfolioSummary.js";
import { MIN_CONFIDENCE_BY_RISK_TOLERANCE } from "@/risk/riskTolerance.js";
import type { MarketSnapshot } from "@/schemas/MarketSnapshot.js";
import { fetchMarketSnapshots } from "@/sources/market/fetchMarketSnapshots.js";
import type { StoredPortfolio } from "@/storage/repositories/portfolioRepository.js";

export type BuildPortfolioSummaryInputOptions = {
	fetchMarketSnapshotsImpl?: typeof fetchMarketSnapshots;
	fetchImpl?: typeof fetch;
	marketSnapshots?: readonly MarketSnapshot[];
};

export async function buildPortfolioSummaryInput(
	config: AppConfig,
	portfolio: StoredPortfolio,
	options: BuildPortfolioSummaryInputOptions = {},
): Promise<PortfolioSummaryInput> {
	const analyzableAssets = getAnalyzableAssets(config);
	const marketData =
		options.marketSnapshots ??
		(await (options.fetchMarketSnapshotsImpl ?? fetchMarketSnapshots)(
			analyzableAssets,
			{
				baseUrl: config.coingecko.baseUrl,
				...(config.coingecko.apiKey ? { apiKey: config.coingecko.apiKey } : {}),
				...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
			},
		));

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

	return {
		accumulateSymbol,
		holdings: portfolio.holdings,
		startingUsdValue: portfolio.initialQuoteBaseline,
		currentUsdValue: usdValue,
		accumulateValue,
		startingAccumulateValue: portfolio.initialBtcBaseline,
		allTimeReturnPct:
			computeReturnFraction(accumulateValue, portfolio.initialBtcBaseline) *
			100,
		riskTolerance: portfolio.riskTolerance,
		minConfidence: MIN_CONFIDENCE_BY_RISK_TOLERANCE[portfolio.riskTolerance],
	};
}

export async function fetchMarketSnapshotsForConfig(
	config: AppConfig,
	options: BuildPortfolioSummaryInputOptions = {},
): Promise<MarketSnapshot[]> {
	const analyzableAssets = getAnalyzableAssets(config);
	return (options.fetchMarketSnapshotsImpl ?? fetchMarketSnapshots)(
		analyzableAssets,
		{
			baseUrl: config.coingecko.baseUrl,
			...(config.coingecko.apiKey ? { apiKey: config.coingecko.apiKey } : {}),
			...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
		},
	);
}
