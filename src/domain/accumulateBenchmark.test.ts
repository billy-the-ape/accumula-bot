import { describe, expect, it } from "vitest";
import {
	computePortfolioAccumulateValue,
	computeReturnFraction,
} from "@/domain/accumulateBenchmark.js";

const prices = {
	BTC: 100_000,
	ETH: 3_000,
	USDC: 1,
} as const;

describe("accumulateBenchmark", () => {
	it("expresses portfolio value in BTC terms", () => {
		const holdings = { USDC: 1_000, BTC: 0.01 };

		expect(computePortfolioAccumulateValue(holdings, prices, "BTC")).toBe(0.02);
	});

	it("expresses portfolio value in ETH terms", () => {
		const holdings = { USDC: 3_000, ETH: 1 };

		expect(computePortfolioAccumulateValue(holdings, prices, "ETH")).toBe(2);
	});

	it("expresses portfolio value in USDC terms", () => {
		const holdings = { USDC: 1_000, BTC: 0.01 };

		expect(computePortfolioAccumulateValue(holdings, prices, "USDC")).toBe(
			2_000,
		);
	});

	it("returns zero for an empty portfolio", () => {
		expect(computePortfolioAccumulateValue({}, prices, "BTC")).toBe(0);
	});

	it("computes return fraction between two benchmark values", () => {
		expect(computeReturnFraction(1.1, 1)).toBeCloseTo(0.1);
		expect(computeReturnFraction(0.97, 1)).toBeCloseTo(-0.03);
		expect(computeReturnFraction(0, 0)).toBe(0);
	});
});
