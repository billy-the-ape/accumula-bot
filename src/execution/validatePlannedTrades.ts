import type { PortfolioHoldings, PriceMap } from "@/domain/types.js";
import type { PlannedFill } from "@/execution/planTrades.js";
import { DEFAULT_RISK_LIMITS } from "@/risk/riskLimits.js";
import type { ProposedTrade } from "@/risk/types.js";
import { validateBeforeExecution } from "@/risk/validateBeforeExecution.js";
import type { TradeRecommendation } from "@/schemas/TradeRecommendation.js";

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

export function buildProposedTradesFromPlan(
	holdings: PortfolioHoldings,
	fills: readonly PlannedFill[],
	cashSymbol: string,
): {
	validationHoldings: PortfolioHoldings;
	proposedTrades: ProposedTrade[];
} {
	let validationHoldings = { ...holdings };
	const proposedTrades: ProposedTrade[] = [];

	for (const fill of fills) {
		if (fill.side === "sell") {
			validationHoldings = applyFillToHoldings(
				validationHoldings,
				fill,
				cashSymbol,
			);
			continue;
		}

		if (fill.symbol === cashSymbol) {
			continue;
		}

		proposedTrades.push({
			symbol: fill.symbol,
			quoteValue: fill.quantity * fill.priceUsd,
		});
	}

	return { validationHoldings, proposedTrades };
}

export function validatePlannedPaperTrades(input: {
	recommendation: TradeRecommendation;
	holdings: PortfolioHoldings;
	prices: PriceMap;
	tradingEnabled: boolean;
	accumulateSymbol: string;
	dailyBaselineBtcValue: number;
	weeklyBaselineBtcValue: number;
	cashSymbol: string;
	tradeableSymbols: readonly string[];
	fills: readonly PlannedFill[];
}) {
	const { validationHoldings, proposedTrades } = buildProposedTradesFromPlan(
		input.holdings,
		input.fills,
		input.cashSymbol,
	);

	return validateBeforeExecution({
		recommendation: input.recommendation,
		holdings: validationHoldings,
		prices: input.prices,
		tradingEnabled: input.tradingEnabled,
		accumulateSymbol: input.accumulateSymbol,
		dailyBaselineBtcValue: input.dailyBaselineBtcValue,
		weeklyBaselineBtcValue: input.weeklyBaselineBtcValue,
		cashSymbol: input.cashSymbol,
		tradeableSymbols: input.tradeableSymbols,
		proposedTrades,
		limits: DEFAULT_RISK_LIMITS,
	});
}
