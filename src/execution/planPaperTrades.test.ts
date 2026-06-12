import { describe, expect, it } from "vitest";
import { planPaperTrades } from "@/execution/planPaperTrades.js";
import { DEFAULT_RISK_LIMITS } from "@/risk/riskLimits.js";

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

describe("planPaperTrades", () => {
	it("plans defensive sells into cash", () => {
		const result = planPaperTrades({
			holdings: { USDC: 5_000, SOL: 10, ETH: 1 },
			prices,
			recommendedAsset: "USDC",
			cashSymbol: "USDC",
			...defaultLimits,
		});

		expect(result.fills).toEqual([
			{ side: "sell", symbol: "SOL", quantity: 10, priceUsd: 150 },
			{ side: "sell", symbol: "ETH", quantity: 1, priceUsd: 3_000 },
		]);
	});

	it("plans rotation sells and a capped buy", () => {
		const result = planPaperTrades({
			holdings: { USDC: 10_000, SOL: 10 },
			prices,
			recommendedAsset: "BTC",
			cashSymbol: "USDC",
			...defaultLimits,
		});

		expect(result.fills[0]).toEqual({
			side: "sell",
			symbol: "SOL",
			quantity: 10,
			priceUsd: 150,
		});
		expect(result.fills[1]).toEqual({
			side: "buy",
			symbol: "BTC",
			quantity: 2875 / 100_000,
			priceUsd: 100_000,
		});
	});

	it("returns hold when already aligned in cash", () => {
		const result = planPaperTrades({
			holdings: { USDC: 10_000 },
			prices,
			recommendedAsset: "USDC",
			cashSymbol: "USDC",
			...defaultLimits,
		});

		expect(result.fills).toEqual([]);
		expect(result.holdReason).toMatch(/already aligned/i);
	});

	it("buys up to 25% on first allocation from cash", () => {
		const result = planPaperTrades({
			holdings: { USDC: 10_000 },
			prices,
			recommendedAsset: "ETH",
			cashSymbol: "USDC",
			...defaultLimits,
		});

		expect(result.fills).toEqual([
			{
				side: "buy",
				symbol: "ETH",
				quantity: 2500 / 3_000,
				priceUsd: 3_000,
			},
		]);
	});

	it("adds another 25% tranche when the same asset is recommended again", () => {
		const result = planPaperTrades({
			holdings: { USDC: 7_500, ETH: 2500 / 3_000 },
			prices,
			recommendedAsset: "ETH",
			cashSymbol: "USDC",
			...defaultLimits,
		});

		expect(result.fills).toEqual([
			{
				side: "buy",
				symbol: "ETH",
				quantity: 2500 / 3_000,
				priceUsd: 3_000,
			},
		]);
	});

	it("holds when the recommended asset is already at the 50% cap", () => {
		const result = planPaperTrades({
			holdings: { USDC: 5_000, ETH: 5000 / 3_000 },
			prices,
			recommendedAsset: "ETH",
			cashSymbol: "USDC",
			...defaultLimits,
		});

		expect(result.fills).toEqual([]);
		expect(result.holdReason).toMatch(/already aligned/i);
	});

	it("trims a recommended asset above the 50% position cap", () => {
		const result = planPaperTrades({
			holdings: { USDC: 4_000, ETH: 6000 / 3_000 },
			prices,
			recommendedAsset: "ETH",
			cashSymbol: "USDC",
			...defaultLimits,
		});

		expect(result.fills).toEqual([
			{
				side: "sell",
				symbol: "ETH",
				quantity: 1000 / 3_000,
				priceUsd: 3_000,
			},
		]);
	});
});
