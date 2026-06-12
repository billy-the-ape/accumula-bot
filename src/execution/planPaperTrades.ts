import {
	getAllocationFraction,
	getHoldingQuoteValue,
	getTotalPortfolioQuoteValue,
} from "@/domain/allocation.js";
import type { PortfolioHoldings, PriceMap } from "@/domain/types.js";
import type { TradeSide } from "@/schemas/Trade.js";

export type PlannedFill = {
	side: TradeSide;
	symbol: string;
	quantity: number;
	priceUsd: number;
};

export type PlanPaperTradesInput = {
	holdings: PortfolioHoldings;
	prices: PriceMap;
	recommendedAsset: string;
	cashSymbol: string;
	maxPurchaseFraction: number;
	maxPositionFraction: number;
};

export type PlanPaperTradesResult = {
	fills: PlannedFill[];
	holdReason?: string;
};

function requirePrice(prices: PriceMap, symbol: string): number {
	const price = prices[symbol];
	if (price === undefined) {
		throw new Error(`Missing price for ${symbol}`);
	}
	return price;
}

function applyFillToHoldings(
	holdings: PortfolioHoldings,
	fill: PlannedFill,
	cashSymbol: string,
): PortfolioHoldings {
	const next: Record<string, number> = { ...holdings };
	const quoteValue = fill.quantity * fill.priceUsd;

	if (fill.side === "sell") {
		next[fill.symbol] = (next[fill.symbol] ?? 0) - fill.quantity;
		if (fill.symbol !== cashSymbol) {
			next[cashSymbol] = (next[cashSymbol] ?? 0) + quoteValue;
		}
	} else {
		next[fill.symbol] = (next[fill.symbol] ?? 0) + fill.quantity;
		if (fill.symbol !== cashSymbol) {
			next[cashSymbol] = (next[cashSymbol] ?? 0) - quoteValue;
		}
	}

	for (const [symbol, quantity] of Object.entries(next)) {
		if (quantity <= 0) {
			delete next[symbol];
		}
	}

	return next;
}

function planPartialSellToTargetAllocation(
	holdings: PortfolioHoldings,
	prices: PriceMap,
	symbol: string,
	targetFraction: number,
): PlannedFill | undefined {
	const currentFraction = getAllocationFraction(holdings, prices, symbol);
	if (currentFraction <= targetFraction) {
		return undefined;
	}

	const totalValue = getTotalPortfolioQuoteValue(holdings, prices);
	const currentValue = getHoldingQuoteValue(holdings, symbol, prices);
	const targetValue = totalValue * targetFraction;
	const sellValue = currentValue - targetValue;
	if (sellValue <= 0) {
		return undefined;
	}

	const priceUsd = requirePrice(prices, symbol);
	return {
		side: "sell",
		symbol,
		quantity: sellValue / priceUsd,
		priceUsd,
	};
}

function planDefensiveCashSells(
	holdings: PortfolioHoldings,
	prices: PriceMap,
	cashSymbol: string,
): PlannedFill[] {
	const fills: PlannedFill[] = [];

	for (const [symbol, quantity] of Object.entries(holdings)) {
		if (symbol === cashSymbol || quantity <= 0) {
			continue;
		}

		fills.push({
			side: "sell",
			symbol,
			quantity,
			priceUsd: requirePrice(prices, symbol),
		});
	}

	return fills;
}

function planRecommendedBuy(
	simulated: PortfolioHoldings,
	recommendedAsset: string,
	prices: PriceMap,
	cashSymbol: string,
	maxPurchaseFraction: number,
	maxPositionFraction: number,
): PlannedFill | undefined {
	const totalValue = getTotalPortfolioQuoteValue(simulated, prices);
	if (totalValue <= 0) {
		return undefined;
	}

	const currentValue = getHoldingQuoteValue(
		simulated,
		recommendedAsset,
		prices,
	);
	const roomToCap = totalValue * maxPositionFraction - currentValue;
	const maxPurchaseValue = totalValue * maxPurchaseFraction;
	const cashAvailable = simulated[cashSymbol] ?? 0;
	const buyValue = Math.min(
		Math.max(0, roomToCap),
		maxPurchaseValue,
		cashAvailable,
	);

	if (buyValue <= 0) {
		return undefined;
	}

	const priceUsd = requirePrice(prices, recommendedAsset);
	return {
		side: "buy",
		symbol: recommendedAsset,
		quantity: buyValue / priceUsd,
		priceUsd,
	};
}

function planRotation(
	holdings: PortfolioHoldings,
	prices: PriceMap,
	recommendedAsset: string,
	cashSymbol: string,
	maxPurchaseFraction: number,
	maxPositionFraction: number,
): PlannedFill[] {
	const fills: PlannedFill[] = [];

	for (const [symbol, quantity] of Object.entries(holdings)) {
		if (symbol === cashSymbol || symbol === recommendedAsset || quantity <= 0) {
			continue;
		}

		fills.push({
			side: "sell",
			symbol,
			quantity,
			priceUsd: requirePrice(prices, symbol),
		});
	}

	let simulated = holdings;
	for (const fill of fills) {
		simulated = applyFillToHoldings(simulated, fill, cashSymbol);
	}

	const recommendedOverCap = planPartialSellToTargetAllocation(
		simulated,
		prices,
		recommendedAsset,
		maxPositionFraction,
	);
	if (recommendedOverCap) {
		fills.push(recommendedOverCap);
		simulated = applyFillToHoldings(simulated, recommendedOverCap, cashSymbol);
	}

	const buy = planRecommendedBuy(
		simulated,
		recommendedAsset,
		prices,
		cashSymbol,
		maxPurchaseFraction,
		maxPositionFraction,
	);
	if (buy) {
		fills.push(buy);
	}

	return fills;
}

export function planPaperTrades(
	input: PlanPaperTradesInput,
): PlanPaperTradesResult {
	const {
		holdings,
		prices,
		recommendedAsset,
		cashSymbol,
		maxPurchaseFraction,
		maxPositionFraction,
	} = input;

	const fills =
		recommendedAsset === cashSymbol
			? planDefensiveCashSells(holdings, prices, cashSymbol)
			: planRotation(
					holdings,
					prices,
					recommendedAsset,
					cashSymbol,
					maxPurchaseFraction,
					maxPositionFraction,
				);

	if (fills.length === 0) {
		return {
			fills,
			holdReason: "Portfolio already aligned with recommendation",
		};
	}

	return { fills };
}
