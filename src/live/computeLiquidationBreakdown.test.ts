import { describe, expect, it } from "vitest";
import { computeLiquidationBreakdown } from "@/live/computeLiquidationBreakdown.js";

describe("computeLiquidationBreakdown", () => {
	it("charges fee on profit only", () => {
		const result = computeLiquidationBreakdown({
			totalDepositedUsd: 1000,
			totalWithdrawnUsd: 0,
			grossUsdc: 1200,
			profitFeeBps: 500,
		});

		expect(result.profitUsd).toBe(200);
		expect(result.feeUsd).toBe(10);
		expect(result.netToUserUsd).toBe(1190);
	});

	it("waives fee at a loss", () => {
		const result = computeLiquidationBreakdown({
			totalDepositedUsd: 1000,
			totalWithdrawnUsd: 0,
			grossUsdc: 900,
			profitFeeBps: 500,
		});

		expect(result.profitUsd).toBe(0);
		expect(result.feeUsd).toBe(0);
		expect(result.netToUserUsd).toBe(900);
	});

	it("uses remaining deposit basis after prior withdrawals", () => {
		const result = computeLiquidationBreakdown({
			totalDepositedUsd: 1000,
			totalWithdrawnUsd: 200,
			grossUsdc: 900,
			profitFeeBps: 500,
		});

		expect(result.costBasisUsd).toBe(800);
		expect(result.profitUsd).toBe(100);
		expect(result.feeUsd).toBe(5);
		expect(result.netToUserUsd).toBe(895);
	});
});
