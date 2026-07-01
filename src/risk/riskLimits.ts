export const DEFAULT_RISK_LIMITS = {
	maxAllocationPerPurchase: 0.15,
	maxAllocationPerAsset: 0.7,
	maxPositions: 5,
	maxDailyLossFraction: 0.1,
	maxWeeklyLossFraction: 0.2,
	minPurchaseFractionOfCash: 0.05,
	maxPurchaseFractionOfCash: 0.25,
	minUsdPurchase: 5, // minimum purchase value in USD (otherwise fees make it not worth it)

	confidenceTiers: [
		{
			stablePctLessThan: 0.25, // percent of portfolio value
			minConfidence: 0.8,
			minDirectionScore: 7,
		},
		{
			stablePctLessThan: 0.1, // percent of portfolio value
			minConfidence: 0.9,
			minDirectionScore: 8,
		},
	],
} as const;

export type RiskLimits = typeof DEFAULT_RISK_LIMITS;
