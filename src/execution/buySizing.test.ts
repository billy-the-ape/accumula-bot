import { describe, expect, it } from "vitest";
import {
	computeBuyScore,
	getApplicableConfidenceTier,
	passesStableTierGate,
	purchaseFractionFromScore,
} from "@/execution/buySizing.js";
import { DEFAULT_RISK_LIMITS } from "@/risk/riskLimits.js";
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

describe("computeBuyScore", () => {
	it("returns 0 when confidence is below the buy threshold", () => {
		expect(
			computeBuyScore(outlook("BTC", 10, 0.5), DEFAULT_OUTLOOK_THRESHOLDS),
		).toBe(0);
	});

	it("returns 0 when direction is below the buy threshold", () => {
		expect(
			computeBuyScore(outlook("BTC", 6, 0.9), DEFAULT_OUTLOOK_THRESHOLDS),
		).toBe(0);
	});

	it("returns minimum non-zero score at the buy direction threshold", () => {
		expect(
			computeBuyScore(outlook("BTC", 7, 0.8), DEFAULT_OUTLOOK_THRESHOLDS),
		).toBe(0);
	});

	it("returns 1 for max direction and max confidence", () => {
		expect(
			computeBuyScore(outlook("BTC", 10, 1), DEFAULT_OUTLOOK_THRESHOLDS),
		).toBe(1);
	});

	it("increases with confidence at fixed direction", () => {
		const lower = computeBuyScore(
			outlook("BTC", 9, 0.7),
			DEFAULT_OUTLOOK_THRESHOLDS,
		);
		const higher = computeBuyScore(
			outlook("BTC", 9, 0.9),
			DEFAULT_OUTLOOK_THRESHOLDS,
		);
		expect(higher).toBeGreaterThan(lower);
	});

	it("increases with direction at fixed confidence", () => {
		const lower = computeBuyScore(
			outlook("BTC", 8, 0.8),
			DEFAULT_OUTLOOK_THRESHOLDS,
		);
		const higher = computeBuyScore(
			outlook("BTC", 10, 0.8),
			DEFAULT_OUTLOOK_THRESHOLDS,
		);
		expect(higher).toBeGreaterThan(lower);
	});
});

describe("purchaseFractionFromScore", () => {
	it("maps score 0 to the minimum cash fraction", () => {
		expect(purchaseFractionFromScore(0, DEFAULT_RISK_LIMITS)).toBe(0.05);
	});

	it("maps score 1 to the maximum cash fraction", () => {
		expect(purchaseFractionFromScore(1, DEFAULT_RISK_LIMITS)).toBe(0.25);
	});

	it("maps midpoint score linearly", () => {
		expect(purchaseFractionFromScore(0.5, DEFAULT_RISK_LIMITS)).toBeCloseTo(
			0.15,
		);
	});

	it("clamps scores outside the unit interval", () => {
		expect(purchaseFractionFromScore(-1, DEFAULT_RISK_LIMITS)).toBe(0.05);
		expect(purchaseFractionFromScore(2, DEFAULT_RISK_LIMITS)).toBe(0.25);
	});
});

describe("getApplicableConfidenceTier", () => {
	it("returns undefined when stable allocation is above all tiers", () => {
		expect(
			getApplicableConfidenceTier(0.3, DEFAULT_RISK_LIMITS.confidenceTiers),
		).toBeUndefined();
	});

	it("returns the 25% tier when stable allocation is below 25%", () => {
		expect(
			getApplicableConfidenceTier(0.2, DEFAULT_RISK_LIMITS.confidenceTiers),
		).toEqual(DEFAULT_RISK_LIMITS.confidenceTiers[0]);
	});

	it("returns the strictest tier when stable allocation is very low", () => {
		expect(
			getApplicableConfidenceTier(0.05, DEFAULT_RISK_LIMITS.confidenceTiers),
		).toEqual(DEFAULT_RISK_LIMITS.confidenceTiers[1]);
	});
});

describe("passesStableTierGate", () => {
	it("passes when stable allocation is above all tiers", () => {
		expect(
			passesStableTierGate(
				outlook("BTC", 7, 0.7),
				0.3,
				DEFAULT_RISK_LIMITS.confidenceTiers,
			),
		).toBe(true);
	});

	it("blocks when stable allocation is low and confidence is insufficient", () => {
		expect(
			passesStableTierGate(
				outlook("BTC", 8, 0.75),
				0.2,
				DEFAULT_RISK_LIMITS.confidenceTiers,
			),
		).toBe(false);
	});

	it("passes when stable allocation is low and confidence meets the tier", () => {
		expect(
			passesStableTierGate(
				outlook("BTC", 8, 0.85),
				0.2,
				DEFAULT_RISK_LIMITS.confidenceTiers,
			),
		).toBe(true);
	});

	it("requires the strictest tier when stable allocation is very low", () => {
		expect(
			passesStableTierGate(
				outlook("BTC", 8, 0.85),
				0.05,
				DEFAULT_RISK_LIMITS.confidenceTiers,
			),
		).toBe(false);
		expect(
			passesStableTierGate(
				outlook("BTC", 9, 0.95),
				0.05,
				DEFAULT_RISK_LIMITS.confidenceTiers,
			),
		).toBe(true);
	});
});
