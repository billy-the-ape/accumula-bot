import {
	getAllocationFraction,
	getHoldingQuoteValue,
	getTotalPortfolioQuoteValue,
} from "@/domain/allocation.js";
import type { PortfolioHoldings, PriceMap } from "@/domain/types.js";
import {
	deriveAssetActions,
	type OutlookThresholds,
} from "@/execution/outlookActions.js";
import type { TradeSide } from "@/schemas/Trade.js";
import type { AssetOutlook } from "@/schemas/TradeRecommendation.js";

export type PlannedFill = {
	side: TradeSide;
	symbol: string;
	quantity: number;
	priceUsd: number;
};

export type PlanTradesInput = {
	holdings: PortfolioHoldings;
	prices: PriceMap;
	outlooks: readonly AssetOutlook[];
	cashSymbol: string;
	maxPurchaseFraction: number;
	maxPositionFraction: number;
	thresholds: OutlookThresholds;
};

export type PlanTradesResult = {
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

function planAssetSell(
	holdings: PortfolioHoldings,
	prices: PriceMap,
	symbol: string,
): PlannedFill | undefined {
	const quantity = holdings[symbol] ?? 0;
	if (quantity <= 0) {
		return undefined;
	}

	return {
		side: "sell",
		symbol,
		quantity,
		priceUsd: requirePrice(prices, symbol),
	};
}

function planAssetBuy(
	holdings: PortfolioHoldings,
	prices: PriceMap,
	symbol: string,
	cashSymbol: string,
	maxPurchaseFraction: number,
	maxPositionFraction: number,
): PlannedFill | undefined {
	const totalValue = getTotalPortfolioQuoteValue(holdings, prices);
	if (totalValue <= 0) {
		return undefined;
	}

	const currentValue = getHoldingQuoteValue(holdings, symbol, prices);
	const roomToCap = totalValue * maxPositionFraction - currentValue;
	const maxPurchaseValue = totalValue * maxPurchaseFraction;
	const cashAvailable = holdings[cashSymbol] ?? 0;
	const buyValue = Math.min(
		Math.max(0, roomToCap),
		maxPurchaseValue,
		cashAvailable,
	);

	if (buyValue <= 0) {
		return undefined;
	}

	const priceUsd = requirePrice(prices, symbol);
	return {
		side: "buy",
		symbol,
		quantity: buyValue / priceUsd,
		priceUsd,
	};
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

export function planTrades(input: PlanTradesInput): PlanTradesResult {
	const {
		holdings,
		prices,
		outlooks,
		cashSymbol,
		maxPurchaseFraction,
		maxPositionFraction,
		thresholds,
	} = input;

	const actions = deriveAssetActions(outlooks, thresholds);
	const fills: PlannedFill[] = [];
	let simulated = holdings;

	for (const [symbol, action] of actions) {
		if (symbol === cashSymbol || action !== "sell") {
			continue;
		}

		const sell = planAssetSell(simulated, prices, symbol);
		if (sell) {
			fills.push(sell);
			simulated = applyFillToHoldings(simulated, sell, cashSymbol);
		}
	}

	for (const [symbol, action] of actions) {
		if (symbol === cashSymbol || action !== "buy") {
			continue;
		}

		const trimOverCap = planPartialSellToTargetAllocation(
			simulated,
			prices,
			symbol,
			maxPositionFraction,
		);
		if (trimOverCap) {
			fills.push(trimOverCap);
			simulated = applyFillToHoldings(simulated, trimOverCap, cashSymbol);
		}

		const buy = planAssetBuy(
			simulated,
			prices,
			symbol,
			cashSymbol,
			maxPurchaseFraction,
			maxPositionFraction,
		);
		if (buy) {
			fills.push(buy);
			simulated = applyFillToHoldings(simulated, buy, cashSymbol);
		}
	}

	if (fills.length === 0) {
		return {
			fills,
			holdReason: "No outlook-driven trades required",
		};
	}

	return { fills };
}
