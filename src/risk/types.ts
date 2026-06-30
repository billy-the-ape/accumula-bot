import type { PortfolioHoldings, PriceMap } from "@/domain/types.js";
import type { RiskLimits } from "@/risk/riskLimits.js";
import type { TradeRecommendation } from "@/schemas/TradeRecommendation.js";

export type RiskViolationCode =
	| "TRADING_DISABLED"
	| "DAILY_LOSS_LIMIT"
	| "WEEKLY_LOSS_LIMIT"
	| "UNTRADEABLE_ASSET"
	| "MAX_ALLOCATION"
	| "MAX_POSITIONS";

export type RiskViolation = {
	code: RiskViolationCode;
	message: string;
};

export type RiskAssessment = {
	allowed: boolean;
	violations: RiskViolation[];
};

export type ProposedTrade = {
	symbol: string;
	quoteValue: number;
};

export type ValidateBeforeExecutionInput = {
	recommendation: TradeRecommendation;
	holdings: PortfolioHoldings;
	prices: PriceMap;
	tradingEnabled: boolean;
	accumulateSymbol: string;
	dailyBaselineBtcValue: number;
	weeklyBaselineBtcValue: number;
	cashSymbol: string;
	tradeableSymbols: readonly string[];
	proposedTrades?: readonly ProposedTrade[];
	limits?: RiskLimits;
};
