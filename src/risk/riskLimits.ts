export const DEFAULT_RISK_LIMITS = {
	maxAllocationPerPurchase: 0.15,
	maxAllocationPerAsset: 0.7,
	maxPositions: 5,
	maxDailyLossFraction: 0.1,
	maxWeeklyLossFraction: 0.2,
} as const;

export type RiskLimits = {
	readonly maxAllocationPerPurchase: number;
	readonly maxAllocationPerAsset: number;
	readonly maxPositions: number;
	readonly maxDailyLossFraction: number;
	readonly maxWeeklyLossFraction: number;
};
