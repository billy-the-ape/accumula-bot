import type { PortfolioHoldings, PriceMap } from "@/domain/types.js";

function requirePrice(prices: PriceMap, symbol: string): number {
	const price = prices[symbol];
	if (price === undefined) {
		throw new Error(`Missing price for ${symbol}`);
	}
	return price;
}

export function getHoldingQuoteValue(
	holdings: PortfolioHoldings,
	symbol: string,
	prices: PriceMap,
): number {
	const quantity = holdings[symbol] ?? 0;
	if (quantity === 0) {
		return 0;
	}
	return quantity * requirePrice(prices, symbol);
}

export function getTotalPortfolioQuoteValue(
	holdings: PortfolioHoldings,
	prices: PriceMap,
): number {
	let total = 0;
	for (const [symbol, quantity] of Object.entries(holdings)) {
		if (quantity === 0) {
			continue;
		}
		total += quantity * requirePrice(prices, symbol);
	}
	return total;
}

export function getAllocationFraction(
	holdings: PortfolioHoldings,
	prices: PriceMap,
	symbol: string,
): number {
	const total = getTotalPortfolioQuoteValue(holdings, prices);
	if (total === 0) {
		return 0;
	}
	return getHoldingQuoteValue(holdings, symbol, prices) / total;
}

export function countOpenPositions(
	holdings: PortfolioHoldings,
	options?: { excludeSymbols?: readonly string[] },
): number {
	const excluded = new Set(options?.excludeSymbols ?? []);
	return Object.entries(holdings).filter(
		([symbol, quantity]) => quantity > 0 && !excluded.has(symbol),
	).length;
}

export function wouldExceedMaxAllocation(
	holdings: PortfolioHoldings,
	prices: PriceMap,
	symbol: string,
	additionalQuoteValue: number,
	maxFraction: number,
): boolean {
	const currentTotal = getTotalPortfolioQuoteValue(holdings, prices);
	const newTotal = currentTotal + additionalQuoteValue;
	if (newTotal <= 0) {
		return false;
	}

	const newAssetValue =
		getHoldingQuoteValue(holdings, symbol, prices) + additionalQuoteValue;
	return newAssetValue / newTotal > maxFraction;
}
