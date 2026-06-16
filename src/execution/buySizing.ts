import type { OutlookThresholds } from "@/execution/outlookActions.js";
import type { RiskLimits } from "@/risk/riskLimits.js";
import type { AssetOutlook } from "@/schemas/TradeRecommendation.js";

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

export function computeBuyScore(
	outlook: AssetOutlook,
	thresholds: OutlookThresholds,
): number {
	if (outlook.confidence < thresholds.minConfidence) {
		return 0;
	}

	if (outlook.direction_score < thresholds.buyMinDirectionScore) {
		return 0;
	}

	const directionRange = 10 - thresholds.buyMinDirectionScore;
	if (directionRange <= 0) {
		return 0;
	}

	const directionStrength = clamp01(
		(outlook.direction_score - thresholds.buyMinDirectionScore) /
			directionRange,
	);

	return outlook.confidence * directionStrength;
}

export function purchaseFractionFromScore(
	score: number,
	limits: Pick<
		RiskLimits,
		"minPurchaseFractionOfCash" | "maxPurchaseFractionOfCash"
	>,
): number {
	const clampedScore = clamp01(score);
	const span =
		limits.maxPurchaseFractionOfCash - limits.minPurchaseFractionOfCash;
	return limits.minPurchaseFractionOfCash + clampedScore * span;
}

type ConfidenceTier = RiskLimits["confidenceTiers"][number];

export function getApplicableConfidenceTier(
	stablePct: number,
	tiers: readonly ConfidenceTier[],
): ConfidenceTier | undefined {
	const matching = tiers.filter((tier) => stablePct < tier.stablePctLessThan);
	if (matching.length === 0) {
		return undefined;
	}

	return matching.reduce((strictest, tier) =>
		tier.stablePctLessThan < strictest.stablePctLessThan ? tier : strictest,
	);
}

export function passesStableTierGate(
	outlook: AssetOutlook,
	stablePct: number,
	tiers: readonly ConfidenceTier[],
): boolean {
	const tier = getApplicableConfidenceTier(stablePct, tiers);
	if (tier === undefined) {
		return true;
	}

	return (
		outlook.confidence >= tier.minConfidence &&
		outlook.direction_score >= tier.minDirectionScore
	);
}
