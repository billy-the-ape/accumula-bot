import { describe, expect, it } from "vitest";
import {
	deriveAssetAction,
	deriveAssetActions,
} from "@/execution/outlookActions.js";
import type { AssetOutlook } from "@/schemas/TradeRecommendation.js";

const DEFAULT_OUTLOOK_THRESHOLDS = {
	buyMinDirectionScore: 7,
	sellMaxDirectionScore: 3,
	minConfidence: 0.6,
} as const;

function outlook(
	asset: string,
	directionScore: number,
	confidence: number,
): AssetOutlook {
	return {
		asset,
		direction_score: directionScore,
		confidence,
	};
}

describe("deriveAssetAction", () => {
	it("returns buy for bullish outlooks above the confidence threshold", () => {
		expect(
			deriveAssetAction(outlook("SOL", 8, 0.75), DEFAULT_OUTLOOK_THRESHOLDS),
		).toBe("buy");
	});

	it("returns sell for bearish outlooks above the confidence threshold", () => {
		expect(
			deriveAssetAction(outlook("ETH", 2, 0.8), DEFAULT_OUTLOOK_THRESHOLDS),
		).toBe("sell");
	});

	it("returns hold for neutral outlooks", () => {
		expect(
			deriveAssetAction(outlook("BTC", 5, 0.9), DEFAULT_OUTLOOK_THRESHOLDS),
		).toBe("hold");
	});

	it("returns hold when confidence is below the threshold", () => {
		expect(
			deriveAssetAction(outlook("SOL", 9, 0.4), DEFAULT_OUTLOOK_THRESHOLDS),
		).toBe("hold");
	});
});

describe("deriveAssetActions", () => {
	it("maps each outlook to an action", () => {
		const actions = deriveAssetActions(
			[outlook("BTC", 8, 0.8), outlook("ETH", 3, 0.8), outlook("SOL", 5, 0.9)],
			DEFAULT_OUTLOOK_THRESHOLDS,
		);

		expect(Object.fromEntries(actions)).toEqual({
			BTC: "buy",
			ETH: "sell",
			SOL: "hold",
		});
	});
});
