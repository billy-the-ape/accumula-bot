import type { OutlookThresholds } from "@/execution/outlookActions.js";

export type RiskTolerance = "low" | "medium" | "high";

export const MIN_CONFIDENCE_BY_RISK_TOLERANCE: Record<RiskTolerance, number> = {
	low: 0.74,
	medium: 0.67,
	high: 0.6,
};

export function resolveOutlookThresholds(
	base: OutlookThresholds,
	riskTolerance: RiskTolerance,
): OutlookThresholds {
	return {
		...base,
		minConfidence: MIN_CONFIDENCE_BY_RISK_TOLERANCE[riskTolerance],
	};
}
