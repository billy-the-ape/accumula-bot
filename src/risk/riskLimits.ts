export const DEFAULT_RISK_LIMITS = {
	maxAllocationPerAsset: 0.25,
	maxPositions: 5,
	maxDailyLossFraction: 0.03,
	maxWeeklyLossFraction: 0.1,
} as const;

export type RiskLimits = {
	readonly maxAllocationPerAsset: number;
	readonly maxPositions: number;
	readonly maxDailyLossFraction: number;
	readonly maxWeeklyLossFraction: number;
};
