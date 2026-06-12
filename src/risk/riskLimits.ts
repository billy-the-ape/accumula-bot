export const DEFAULT_RISK_LIMITS = {
	maxAllocationPerPurchase: 0.25,
	maxAllocationPerAsset: 0.5,
	maxPositions: 5,
	maxDailyLossFraction: 0.03,
	maxWeeklyLossFraction: 0.1,
} as const;

export type RiskLimits = {
	readonly maxAllocationPerPurchase: number;
	readonly maxAllocationPerAsset: number;
	readonly maxPositions: number;
	readonly maxDailyLossFraction: number;
	readonly maxWeeklyLossFraction: number;
};
