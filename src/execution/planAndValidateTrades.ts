import type { PriceMap } from "@/domain/types.js";
import type { OutlookThresholds } from "@/execution/outlookActions.js";
import { type PlannedFill, planTrades } from "@/execution/planTrades.js";
import { buildPriceMap } from "@/execution/priceMap.js";
import { validatePlannedPaperTrades } from "@/execution/validatePlannedTrades.js";
import { DEFAULT_RISK_LIMITS } from "@/risk/riskLimits.js";
import { resolveOutlookThresholds } from "@/risk/riskTolerance.js";
import type { MarketSnapshot } from "@/schemas/MarketSnapshot.js";
import type { TradeRecommendation } from "@/schemas/TradeRecommendation.js";
import type { StoredPortfolio } from "@/storage/repositories/portfolioRepository.js";

export type PlanAndValidateInput = {
	portfolio: StoredPortfolio;
	recommendation: TradeRecommendation;
	marketSnapshots: readonly MarketSnapshot[];
	tradeableSymbols: readonly string[];
	outlookThresholds: OutlookThresholds;
	maxPurchaseFraction?: number;
	maxPositionFraction?: number;
	maxRiskOnFraction?: number;
};

export type PlanAndValidateSuccess = {
	ok: true;
	fills: PlannedFill[];
	prices: PriceMap;
	thresholds: OutlookThresholds;
};

export type PlanAndValidateFailure = {
	ok: false;
	reason: string;
	riskBlocked?: boolean;
};

export type PlanAndValidateResult =
	| PlanAndValidateSuccess
	| PlanAndValidateFailure;

export function planAndValidateTrades(
	input: PlanAndValidateInput,
): PlanAndValidateResult {
	const maxPurchaseFraction =
		input.maxPurchaseFraction ?? DEFAULT_RISK_LIMITS.maxAllocationPerPurchase;
	const maxPositionFraction =
		input.maxPositionFraction ?? DEFAULT_RISK_LIMITS.maxAllocationPerAsset;
	const thresholds = resolveOutlookThresholds(
		input.outlookThresholds,
		input.portfolio.riskTolerance,
	);

	const prices = buildPriceMap(
		input.marketSnapshots,
		input.portfolio.cashSymbol,
		{ accumulateSymbol: input.portfolio.assetToAccumulate },
	);
	const plan = planTrades({
		holdings: input.portfolio.holdings,
		prices,
		outlooks: input.recommendation.outlooks,
		cashSymbol: input.portfolio.cashSymbol,
		maxPurchaseFraction,
		maxPositionFraction,
		thresholds,
		riskLimits: DEFAULT_RISK_LIMITS,
	});

	if (plan.fills.length === 0) {
		return {
			ok: false,
			reason: plan.holdReason ?? "No trades planned",
		};
	}

	const risk = validatePlannedPaperTrades({
		recommendation: input.recommendation,
		holdings: input.portfolio.holdings,
		prices,
		tradingEnabled: input.portfolio.tradingEnabled,
		accumulateSymbol: input.portfolio.assetToAccumulate,
		dailyBaselineBtcValue: input.portfolio.dailyBaselineBtcValue,
		weeklyBaselineBtcValue: input.portfolio.weeklyBaselineBtcValue,
		cashSymbol: input.portfolio.cashSymbol,
		tradeableSymbols: input.tradeableSymbols,
		fills: plan.fills,
		...(input.maxRiskOnFraction !== undefined
			? { maxRiskOnFraction: input.maxRiskOnFraction }
			: {}),
	});

	if (!risk.allowed) {
		return {
			ok: false,
			reason: risk.violations.map((violation) => violation.message).join("; "),
			riskBlocked: true,
		};
	}

	return {
		ok: true,
		fills: plan.fills,
		prices,
		thresholds,
	};
}
