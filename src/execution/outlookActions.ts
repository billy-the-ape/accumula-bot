import type { AssetOutlook } from "@/schemas/TradeRecommendation.js";

export const DEFAULT_OUTLOOK_THRESHOLDS = {
	buyMinDirectionScore: 7,
	sellMaxDirectionScore: 3,
	minConfidence: 0.6,
} as const;

export type OutlookThresholds = {
	readonly buyMinDirectionScore: number;
	readonly sellMaxDirectionScore: number;
	readonly minConfidence: number;
};

export type AssetAction = "buy" | "sell" | "hold";

export function deriveAssetAction(
	outlook: AssetOutlook,
	thresholds: OutlookThresholds = DEFAULT_OUTLOOK_THRESHOLDS,
): AssetAction {
	if (outlook.confidence < thresholds.minConfidence) {
		return "hold";
	}

	if (outlook.direction_score >= thresholds.buyMinDirectionScore) {
		return "buy";
	}

	if (outlook.direction_score <= thresholds.sellMaxDirectionScore) {
		return "sell";
	}

	return "hold";
}

export function deriveAssetActions(
	outlooks: readonly AssetOutlook[],
	thresholds: OutlookThresholds = DEFAULT_OUTLOOK_THRESHOLDS,
): Map<string, AssetAction> {
	return new Map(
		outlooks.map((outlook) => [
			outlook.asset,
			deriveAssetAction(outlook, thresholds),
		]),
	);
}
