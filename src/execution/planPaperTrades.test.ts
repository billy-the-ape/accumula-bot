import { describe, expect, it } from "vitest";
import { planPaperTrades } from "@/execution/planPaperTrades.js";
import { DEFAULT_RISK_LIMITS } from "@/risk/riskLimits.js";
import type { AssetOutlook } from "@/schemas/TradeRecommendation.js";

const prices = {
	BTC: 100_000,
	ETH: 3_000,
	SOL: 150,
	USDC: 1,
} as const;

const defaultLimits = {
	maxPurchaseFraction: DEFAULT_RISK_LIMITS.maxAllocationPerPurchase,
	maxPositionFraction: DEFAULT_RISK_LIMITS.maxAllocationPerAsset,
};

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

describe("planPaperTrades", () => {
	it("sells bearish-held assets without touching unrelated positions", () => {
		const result = planPaperTrades({
			holdings: { USDC: 5_000, SOL: 10, ETH: 1 },
			prices,
			outlooks: [
				outlook("ETH", 2, 0.8),
				outlook("SOL", 5, 0.9),
				outlook("BTC", 5, 0.9),
			],
			cashSymbol: "USDC",
			...defaultLimits,
		});

		expect(result.fills).toEqual([
			{ side: "sell", symbol: "ETH", quantity: 1, priceUsd: 3_000 },
		]);
	});

	it("buys bullish assets up to the per-purchase cap", () => {
		const result = planPaperTrades({
			holdings: { USDC: 10_000 },
			prices,
			outlooks: [
				outlook("BTC", 8, 0.75),
				outlook("ETH", 5, 0.9),
				outlook("SOL", 4, 0.9),
			],
			cashSymbol: "USDC",
			...defaultLimits,
		});

		expect(result.fills).toEqual([
			{
				side: "buy",
				symbol: "BTC",
				quantity: 1500 / 100_000,
				priceUsd: 100_000,
			},
		]);
	});

	it("plans mixed sells and buys in one pass", () => {
		const result = planPaperTrades({
			holdings: { USDC: 2_500, ETH: 2, SOL: 10 },
			prices,
			outlooks: [
				outlook("ETH", 2, 0.8),
				outlook("SOL", 8, 0.75),
				outlook("BTC", 5, 0.9),
			],
			cashSymbol: "USDC",
			...defaultLimits,
		});

		expect(result.fills[0]).toEqual({
			side: "sell",
			symbol: "ETH",
			quantity: 2,
			priceUsd: 3_000,
		});
		expect(result.fills[1]).toEqual({
			side: "buy",
			symbol: "SOL",
			quantity: 1500 / 150,
			priceUsd: 150,
		});
	});

	it("returns hold when outlooks are neutral or low confidence", () => {
		const result = planPaperTrades({
			holdings: { USDC: 10_000, ETH: 1 },
			prices,
			outlooks: [
				outlook("ETH", 2, 0.4),
				outlook("SOL", 8, 0.4),
				outlook("BTC", 5, 0.9),
			],
			cashSymbol: "USDC",
			...defaultLimits,
		});

		expect(result.fills).toEqual([]);
		expect(result.holdReason).toMatch(/no outlook-driven trades/i);
	});

	it("adds another tranche when the same asset stays bullish", () => {
		const result = planPaperTrades({
			holdings: { USDC: 8_500, ETH: 1500 / 3_000 },
			prices,
			outlooks: [
				outlook("ETH", 8, 0.75),
				outlook("BTC", 5, 0.9),
				outlook("SOL", 5, 0.9),
			],
			cashSymbol: "USDC",
			...defaultLimits,
		});

		expect(result.fills).toEqual([
			{
				side: "buy",
				symbol: "ETH",
				quantity: 1500 / 3_000,
				priceUsd: 3_000,
			},
		]);
	});

	it("holds when a bullish asset is already at the max position cap", () => {
		const result = planPaperTrades({
			holdings: { USDC: 3_000, ETH: 7000 / 3_000 },
			prices,
			outlooks: [
				outlook("ETH", 9, 0.8),
				outlook("BTC", 5, 0.9),
				outlook("SOL", 5, 0.9),
			],
			cashSymbol: "USDC",
			...defaultLimits,
		});

		expect(result.fills).toEqual([]);
		expect(result.holdReason).toMatch(/no outlook-driven trades/i);
	});
});
