import type { AssetOutlook } from "@/schemas/TradeRecommendation.js";

export type OutlookThresholds = {
	readonly buyMinDirectionScore: number;
	readonly sellMaxDirectionScore: number;
	readonly minConfidence: number;
};

export type AssetAction = "buy" | "sell" | "hold";

export function deriveAssetAction(
	outlook: AssetOutlook,
	thresholds: OutlookThresholds,
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
	thresholds: OutlookThresholds,
): Map<string, AssetAction> {
	return new Map(
		outlooks.map((outlook) => [
			outlook.asset,
			deriveAssetAction(outlook, thresholds),
		]),
	);
}
