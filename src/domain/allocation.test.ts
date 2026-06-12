import { describe, expect, it } from "vitest";
import {
	countOpenPositions,
	getAllocationFraction,
	getHoldingQuoteValue,
	getTotalPortfolioQuoteValue,
	wouldExceedMaxAllocation,
} from "@/domain/allocation.js";

const prices = {
	BTC: 100_000,
	ETH: 3_000,
	SOL: 150,
	USDC: 1,
} as const;

describe("allocation", () => {
	it("values holdings and portfolio total in quote currency", () => {
		const holdings = { USDC: 1_000, BTC: 0.01 };

		expect(getHoldingQuoteValue(holdings, "USDC", prices)).toBe(1_000);
		expect(getHoldingQuoteValue(holdings, "BTC", prices)).toBe(1_000);
		expect(getTotalPortfolioQuoteValue(holdings, prices)).toBe(2_000);
	});

	it("computes allocation fractions", () => {
		const holdings = { USDC: 1_000, BTC: 0.01 };

		expect(getAllocationFraction(holdings, prices, "USDC")).toBe(0.5);
		expect(getAllocationFraction(holdings, prices, "BTC")).toBe(0.5);
	});

	it("counts open positions with optional exclusions", () => {
		const holdings = { USDC: 1_000, BTC: 0.01, ETH: 0 };

		expect(countOpenPositions(holdings)).toBe(2);
		expect(countOpenPositions(holdings, { excludeSymbols: ["USDC"] })).toBe(1);
	});

	it("detects when a trade would exceed max allocation", () => {
		const holdings = { USDC: 750, BTC: 0.0025 };

		expect(wouldExceedMaxAllocation(holdings, prices, "ETH", 333, 0.25)).toBe(
			false,
		);
		expect(wouldExceedMaxAllocation(holdings, prices, "ETH", 334, 0.25)).toBe(
			true,
		);
	});
});
