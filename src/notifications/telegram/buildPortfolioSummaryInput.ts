import type { AppConfig } from "@/config/appConfigSchema.js";
import {
	getCryptocurrency,
	isKnownCryptocurrencySymbol,
} from "@/config/assets.js";
import {
	computePortfolioAccumulateValue,
	computeReturnFraction,
} from "@/domain/accumulateBenchmark.js";
import {
	getHoldingQuoteValue,
	getTotalPortfolioQuoteValue,
} from "@/domain/allocation.js";
import {
	computePositionCostBasisUsd,
	computePositionReturnPct,
} from "@/domain/positionCostBasis.js";
import { buildPriceMap } from "@/execution/priceMap.js";
import { getAnalyzableAssets } from "@/llm/index.js";
import type {
	AssetPerformance,
	PortfolioSummaryInput,
} from "@/notifications/telegram/bot/formatPortfolioSummary.js";
import { resolveMinConfidence } from "@/risk/riskTolerance.js";
import type { MarketSnapshot } from "@/schemas/MarketSnapshot.js";
import type { StoredTrade } from "@/schemas/Trade.js";
import { fetchMarketSnapshots } from "@/sources/market/fetchMarketSnapshots.js";
import type { AppDatabase } from "@/storage/db.js";
import type { StoredPortfolio } from "@/storage/repositories/portfolioRepository.js";
import { listAllTradesForPortfolio } from "@/storage/repositories/tradeRepository.js";

export type BuildPortfolioSummaryInputOptions = {
	db?: AppDatabase;
	trades?: readonly StoredTrade[];
	fetchMarketSnapshotsImpl?: typeof fetchMarketSnapshots;
	fetchImpl?: typeof fetch;
	listAllTradesForPortfolioImpl?: typeof listAllTradesForPortfolio;
	marketSnapshots?: readonly MarketSnapshot[];
};

function isStablecoinSymbol(symbol: string): boolean {
	if (!isKnownCryptocurrencySymbol(symbol)) {
		return false;
	}
	return getCryptocurrency(symbol).isStable === true;
}

function buildAssetPerformances(
	holdings: PortfolioSummaryInput["holdings"],
	prices: ReturnType<typeof buildPriceMap>,
	trades: readonly StoredTrade[],
): AssetPerformance[] {
	return Object.entries(holdings)
		.filter(([symbol, quantity]) => quantity > 0 && !isStablecoinSymbol(symbol))
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([symbol]) => {
			const usdValue = getHoldingQuoteValue(holdings, symbol, prices);
			const costBasisUsd = computePositionCostBasisUsd(trades, symbol);

			return {
				symbol,
				usdValue,
				returnPct: computePositionReturnPct(usdValue, costBasisUsd),
			};
		});
}

async function resolvePortfolioTrades(
	portfolioId: number,
	options: BuildPortfolioSummaryInputOptions,
): Promise<readonly StoredTrade[]> {
	if (options.trades) {
		return options.trades;
	}

	if (!options.db) {
		return [];
	}

	return (options.listAllTradesForPortfolioImpl ?? listAllTradesForPortfolio)(
		options.db,
		portfolioId,
	);
}

export async function buildPortfolioSummaryInput(
	config: AppConfig,
	portfolio: StoredPortfolio,
	options: BuildPortfolioSummaryInputOptions = {},
): Promise<PortfolioSummaryInput> {
	const analyzableAssets = getAnalyzableAssets(config);
	const [marketData, trades] = await Promise.all([
		options.marketSnapshots ??
			(options.fetchMarketSnapshotsImpl ?? fetchMarketSnapshots)(
				analyzableAssets,
				{
					baseUrl: config.coingecko.baseUrl,
					...(config.coingecko.apiKey
						? { apiKey: config.coingecko.apiKey }
						: {}),
					...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
				},
			),
		resolvePortfolioTrades(portfolio.id, options),
	]);

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
		assetPerformances: buildAssetPerformances(
			portfolio.holdings,
			prices,
			trades,
		),
		riskTolerance: portfolio.riskTolerance,
		minConfidence: resolveMinConfidence(portfolio.riskTolerance),
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
