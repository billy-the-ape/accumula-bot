import { describe, expect, it } from "vitest";
import { planTrades } from "@/execution/planTrades.js";
import { DEFAULT_RISK_LIMITS } from "@/risk/riskLimits.js";
import type { AssetOutlook } from "@/schemas/TradeRecommendation.js";

const prices = {
	BTC: 100_000,
	ETH: 3_000,
	SOL: 150,
	USDC: 1,
} as const;

const DEFAULT_OUTLOOK_THRESHOLDS = {
	buyMinDirectionScore: 7,
	sellMaxDirectionScore: 3,
	minConfidence: 0.6,
} as const;

const defaultPlanInput = {
	maxPurchaseFraction: DEFAULT_RISK_LIMITS.maxAllocationPerPurchase,
	maxPositionFraction: DEFAULT_RISK_LIMITS.maxAllocationPerAsset,
	thresholds: DEFAULT_OUTLOOK_THRESHOLDS,
	riskLimits: DEFAULT_RISK_LIMITS,
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

function expectedBuyQuantity(
	cashAvailable: number,
	directionScore: number,
	confidence: number,
	priceUsd: number,
): number {
	const directionStrength =
		(directionScore - DEFAULT_OUTLOOK_THRESHOLDS.buyMinDirectionScore) /
		(10 - DEFAULT_OUTLOOK_THRESHOLDS.buyMinDirectionScore);
	const score = confidence * directionStrength;
	const purchaseFraction =
		DEFAULT_RISK_LIMITS.minPurchaseFractionOfCash +
		score *
			(DEFAULT_RISK_LIMITS.maxPurchaseFractionOfCash -
				DEFAULT_RISK_LIMITS.minPurchaseFractionOfCash);
	return (cashAvailable * purchaseFraction) / priceUsd;
}

describe("planTrades", () => {
	it("sells bearish-held assets without touching unrelated positions", () => {
		const result = planTrades({
			holdings: { USDC: 5_000, SOL: 10, ETH: 1 },
			prices,
			outlooks: [
				outlook("ETH", 2, 0.8),
				outlook("SOL", 5, 0.9),
				outlook("BTC", 5, 0.9),
			],
			cashSymbol: "USDC",
			...defaultPlanInput,
		});

		expect(result.fills).toEqual([
			{ side: "sell", symbol: "ETH", quantity: 1, priceUsd: 3_000 },
		]);
	});

	it("buys bullish assets using a conviction-scaled fraction of remaining cash", () => {
		const result = planTrades({
			holdings: { USDC: 10_000 },
			prices,
			outlooks: [
				outlook("BTC", 8, 0.75),
				outlook("ETH", 5, 0.9),
				outlook("SOL", 4, 0.9),
			],
			cashSymbol: "USDC",
			...defaultPlanInput,
		});

		expect(result.fills).toEqual([
			{
				side: "buy",
				symbol: "BTC",
				quantity: expectedBuyQuantity(10_000, 8, 0.75, 100_000),
				priceUsd: 100_000,
			},
		]);
	});

	it("plans mixed sells and buys in one pass", () => {
		const result = planTrades({
			holdings: { USDC: 2_500, ETH: 2, SOL: 10 },
			prices,
			outlooks: [
				outlook("ETH", 2, 0.8),
				outlook("SOL", 8, 0.75),
				outlook("BTC", 5, 0.9),
			],
			cashSymbol: "USDC",
			...defaultPlanInput,
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
			quantity: expectedBuyQuantity(8_500, 8, 0.75, 150),
			priceUsd: 150,
		});
	});

	it("returns hold when outlooks are neutral or low confidence", () => {
		const result = planTrades({
			holdings: { USDC: 10_000, ETH: 1 },
			prices,
			outlooks: [
				outlook("ETH", 2, 0.4),
				outlook("SOL", 8, 0.4),
				outlook("BTC", 5, 0.9),
			],
			cashSymbol: "USDC",
			...defaultPlanInput,
		});

		expect(result.fills).toEqual([]);
		expect(result.holdReason).toMatch(/no outlook-driven trades/i);
	});

	it("adds another tranche when the same asset stays bullish", () => {
		const result = planTrades({
			holdings: { USDC: 8_500, ETH: 1500 / 3_000 },
			prices,
			outlooks: [
				outlook("ETH", 8, 0.75),
				outlook("BTC", 5, 0.9),
				outlook("SOL", 5, 0.9),
			],
			cashSymbol: "USDC",
			...defaultPlanInput,
		});

		expect(result.fills).toEqual([
			{
				side: "buy",
				symbol: "ETH",
				quantity: expectedBuyQuantity(8_500, 8, 0.75, 3_000),
				priceUsd: 3_000,
			},
		]);
	});

	it("holds when a bullish asset is already at the max position cap", () => {
		const result = planTrades({
			holdings: { USDC: 3_000, ETH: 7000 / 3_000 },
			prices,
			outlooks: [
				outlook("ETH", 9, 0.8),
				outlook("BTC", 5, 0.9),
				outlook("SOL", 5, 0.9),
			],
			cashSymbol: "USDC",
			...defaultPlanInput,
		});

		expect(result.fills).toEqual([]);
		expect(result.holdReason).toMatch(/no outlook-driven trades/i);
	});

	it("sizes larger buys for stronger conviction than weaker conviction", () => {
		const strong = planTrades({
			holdings: { USDC: 10_000 },
			prices,
			outlooks: [
				outlook("BTC", 10, 1),
				outlook("ETH", 5, 0.9),
				outlook("SOL", 5, 0.9),
			],
			cashSymbol: "USDC",
			...defaultPlanInput,
		});
		const weak = planTrades({
			holdings: { USDC: 10_000 },
			prices,
			outlooks: [
				outlook("BTC", 8, 0.75),
				outlook("ETH", 5, 0.9),
				outlook("SOL", 5, 0.9),
			],
			cashSymbol: "USDC",
			...defaultPlanInput,
		});

		const strongBuy = strong.fills.find((fill) => fill.symbol === "BTC");
		const weakBuy = weak.fills.find((fill) => fill.symbol === "BTC");
		expect(strongBuy).toBeDefined();
		expect(weakBuy).toBeDefined();
		expect(strongBuy?.quantity ?? 0).toBeGreaterThan(weakBuy?.quantity ?? 0);
	});

	it("blocks buys when stable allocation is low and conviction is insufficient", () => {
		const result = planTrades({
			holdings: { USDC: 1_500, ETH: 7000 / 3_000, SOL: 10 },
			prices,
			outlooks: [
				outlook("ETH", 8, 0.75),
				outlook("SOL", 5, 0.9),
				outlook("BTC", 5, 0.9),
			],
			cashSymbol: "USDC",
			...defaultPlanInput,
		});

		expect(result.fills).toEqual([]);
		expect(result.holdReason).toMatch(/no outlook-driven trades/i);
	});

	it("allows buys when stable allocation is low but conviction meets the tier", () => {
		const result = planTrades({
			holdings: { USDC: 1_500, ETH: 4000 / 3_000, SOL: 10 },
			prices,
			outlooks: [
				outlook("ETH", 9, 0.95),
				outlook("SOL", 5, 0.9),
				outlook("BTC", 5, 0.9),
			],
			cashSymbol: "USDC",
			...defaultPlanInput,
		});

		expect(result.fills).toEqual([
			{
				side: "buy",
				symbol: "ETH",
				quantity: expectedBuyQuantity(1_500, 9, 0.95, 3_000),
				priceUsd: 3_000,
			},
		]);
	});
});
