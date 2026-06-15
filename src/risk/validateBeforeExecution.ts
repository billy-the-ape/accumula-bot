import {
	countOpenPositions,
	getTotalPortfolioQuoteValue,
	wouldExceedMaxAllocation,
} from "@/domain/allocation.js";
import {
	computePortfolioBtcValue,
	computeReturnFraction,
} from "@/domain/btcBenchmark.js";
import { DEFAULT_RISK_LIMITS } from "@/risk/riskLimits.js";
import type {
	RiskAssessment,
	RiskViolation,
	ValidateBeforeExecutionInput,
} from "@/risk/types.js";

function createAssessment(violations: RiskViolation[]): RiskAssessment {
	return {
		allowed: violations.length === 0,
		violations,
	};
}

function assessKillSwitch(tradingEnabled: boolean): RiskViolation[] {
	if (tradingEnabled) {
		return [];
	}

	return [
		{
			code: "TRADING_DISABLED",
			message: "Trading is disabled by the kill switch",
		},
	];
}

function assessLossLimits(
	holdings: ValidateBeforeExecutionInput["holdings"],
	prices: ValidateBeforeExecutionInput["prices"],
	dailyBaselineBtcValue: number,
	weeklyBaselineBtcValue: number,
	limits: ValidateBeforeExecutionInput["limits"],
): RiskViolation[] {
	const resolvedLimits = limits ?? DEFAULT_RISK_LIMITS;
	const currentBtcValue = computePortfolioBtcValue(holdings, prices);
	const violations: RiskViolation[] = [];

	const dailyReturn = computeReturnFraction(
		currentBtcValue,
		dailyBaselineBtcValue,
	);
	if (dailyReturn <= -resolvedLimits.maxDailyLossFraction) {
		violations.push({
			code: "DAILY_LOSS_LIMIT",
			message: `Daily BTC-denominated loss ${(Math.abs(dailyReturn) * 100).toFixed(2)}% exceeds ${resolvedLimits.maxDailyLossFraction * 100}% limit`,
		});
	}

	const weeklyReturn = computeReturnFraction(
		currentBtcValue,
		weeklyBaselineBtcValue,
	);
	if (weeklyReturn <= -resolvedLimits.maxWeeklyLossFraction) {
		violations.push({
			code: "WEEKLY_LOSS_LIMIT",
			message: `Weekly BTC-denominated loss ${(Math.abs(weeklyReturn) * 100).toFixed(2)}% exceeds ${resolvedLimits.maxWeeklyLossFraction * 100}% limit`,
		});
	}

	return violations;
}

function assessOutlooks(
	recommendation: ValidateBeforeExecutionInput["recommendation"],
	tradeableSymbols: readonly string[],
): RiskViolation[] {
	const tradeable = new Set(tradeableSymbols);

	for (const outlook of recommendation.outlooks) {
		if (!tradeable.has(outlook.asset)) {
			return [
				{
					code: "UNTRADEABLE_ASSET",
					message: `Outlook asset ${outlook.asset} is not in the tradeable universe`,
				},
			];
		}
	}

	return [];
}

function assessSingleProposedTrade(
	holdings: ValidateBeforeExecutionInput["holdings"],
	input: ValidateBeforeExecutionInput,
	limits: NonNullable<ValidateBeforeExecutionInput["limits"]>,
	proposedTrade: NonNullable<
		ValidateBeforeExecutionInput["proposedTrades"]
	>[number],
): RiskViolation[] {
	const violations: RiskViolation[] = [];
	const { symbol, quoteValue } = proposedTrade;

	if (quoteValue <= 0) {
		return violations;
	}

	if (symbol === input.cashSymbol) {
		return violations;
	}

	if (
		wouldExceedMaxAllocation(
			holdings,
			input.prices,
			symbol,
			quoteValue,
			limits.maxAllocationPerAsset,
		)
	) {
		violations.push({
			code: "MAX_ALLOCATION",
			message: `Trade into ${symbol} would exceed ${limits.maxAllocationPerAsset * 100}% max allocation per asset`,
		});
	}

	const currentTotal = getTotalPortfolioQuoteValue(holdings, input.prices);
	if (
		currentTotal > 0 &&
		quoteValue / currentTotal > limits.maxAllocationPerPurchase
	) {
		violations.push({
			code: "MAX_ALLOCATION",
			message: `Single trade into ${symbol} would exceed ${limits.maxAllocationPerPurchase * 100}% per-purchase limit`,
		});
	}

	const existingQuantity = holdings[symbol] ?? 0;
	const openPositions = countOpenPositions(holdings, {
		excludeSymbols: [input.cashSymbol],
	});
	if (existingQuantity === 0 && openPositions >= limits.maxPositions) {
		violations.push({
			code: "MAX_POSITIONS",
			message: `Opening ${symbol} would exceed the ${limits.maxPositions} position limit`,
		});
	}

	return violations;
}

function applyBuyToHoldings(
	holdings: ValidateBeforeExecutionInput["holdings"],
	symbol: string,
	quoteValue: number,
	price: number,
	cashSymbol: string,
): ValidateBeforeExecutionInput["holdings"] {
	const next = { ...holdings };
	next[symbol] = (next[symbol] ?? 0) + quoteValue / price;
	next[cashSymbol] = (next[cashSymbol] ?? 0) - quoteValue;

	for (const [asset, quantity] of Object.entries(next)) {
		if (quantity <= 0) {
			delete next[asset];
		}
	}

	return next;
}

function assessProposedTrades(
	input: ValidateBeforeExecutionInput,
	limits: NonNullable<ValidateBeforeExecutionInput["limits"]>,
): RiskViolation[] {
	const proposedTrades = input.proposedTrades ?? [];
	if (proposedTrades.length === 0) {
		return [];
	}

	const violations: RiskViolation[] = [];
	let simulatedHoldings = { ...input.holdings };

	for (const proposedTrade of proposedTrades) {
		violations.push(
			...assessSingleProposedTrade(
				simulatedHoldings,
				input,
				limits,
				proposedTrade,
			),
		);

		const price = input.prices[proposedTrade.symbol];
		if (price !== undefined && proposedTrade.quoteValue > 0) {
			simulatedHoldings = applyBuyToHoldings(
				simulatedHoldings,
				proposedTrade.symbol,
				proposedTrade.quoteValue,
				price,
				input.cashSymbol,
			);
		}
	}

	return violations;
}

export function validateBeforeExecution(
	input: ValidateBeforeExecutionInput,
): RiskAssessment {
	const limits = input.limits ?? DEFAULT_RISK_LIMITS;
	const violations = [
		...assessKillSwitch(input.tradingEnabled),
		...assessLossLimits(
			input.holdings,
			input.prices,
			input.dailyBaselineBtcValue,
			input.weeklyBaselineBtcValue,
			limits,
		),
		...assessOutlooks(input.recommendation, input.tradeableSymbols),
		...assessProposedTrades(input, limits),
	];

	return createAssessment(violations);
}
