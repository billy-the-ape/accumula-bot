import { getTotalPortfolioQuoteValue } from "@/domain/allocation.js";
import type { PortfolioHoldings, PriceMap } from "@/domain/types.js";

function requirePrice(prices: PriceMap, symbol: string): number {
	const price = prices[symbol];
	if (price === undefined) {
		throw new Error(`Missing price for ${symbol}`);
	}
	return price;
}

export function computePortfolioBtcValue(
	holdings: PortfolioHoldings,
	prices: PriceMap,
	btcSymbol = "BTC",
): number {
	const totalQuoteValue = getTotalPortfolioQuoteValue(holdings, prices);
	if (totalQuoteValue === 0) {
		return 0;
	}
	const btcPrice = requirePrice(prices, btcSymbol);
	return totalQuoteValue / btcPrice;
}

export function computeReturnFraction(
	currentValue: number,
	initialValue: number,
): number {
	if (initialValue === 0) {
		return 0;
	}
	return (currentValue - initialValue) / initialValue;
}
