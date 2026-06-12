import { describe, expect, it } from "vitest";
import {
	computePortfolioBtcValue,
	computeReturnFraction,
} from "@/domain/btcBenchmark.js";

const prices = {
	BTC: 100_000,
	USDC: 1,
} as const;

describe("btcBenchmark", () => {
	it("expresses portfolio value in BTC terms", () => {
		const holdings = { USDC: 1_000, BTC: 0.01 };

		expect(computePortfolioBtcValue(holdings, prices)).toBe(0.02);
	});

	it("returns zero BTC value for an empty portfolio", () => {
		expect(computePortfolioBtcValue({}, prices)).toBe(0);
	});

	it("computes return fraction between two benchmark values", () => {
		expect(computeReturnFraction(1.1, 1)).toBeCloseTo(0.1);
		expect(computeReturnFraction(0.97, 1)).toBeCloseTo(-0.03);
		expect(computeReturnFraction(0, 0)).toBe(0);
	});
});
