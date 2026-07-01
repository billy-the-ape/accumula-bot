import { describe, expect, it, vi } from "vitest";
import {
	computeCategoryExposure,
	logCategoryExposure,
	summarizeCategoryExposure,
} from "@/risk/categoryExposure.js";

describe("computeCategoryExposure", () => {
	it("computes exposure fractions by macro category", () => {
		const report = computeCategoryExposure(
			{ USDC: 5000, BTC: 3000, ETH: 2000 },
			{ USDC: 1, BTC: 1, ETH: 1 },
		);

		expect(report.totalUsd).toBe(10_000);
		expect(report.exposure.risk_off).toBeCloseTo(0.5);
		expect(report.exposure.neutral).toBeCloseTo(0.3);
		expect(report.exposure.risk_on).toBeCloseTo(0.2);
	});

	it("returns zero exposure for empty portfolio", () => {
		const report = computeCategoryExposure({}, { USDC: 1 });

		expect(report.totalUsd).toBe(0);
		expect(report.exposure).toEqual({
			risk_off: 0,
			neutral: 0,
			risk_on: 0,
		});
	});

	it("ignores unknown symbols", () => {
		const report = computeCategoryExposure(
			{ USDC: 1000, UNKNOWN: 500 },
			{ USDC: 1, UNKNOWN: 1 },
		);

		expect(report.exposure.risk_off).toBe(1);
		expect(report.exposure.neutral).toBe(0);
	});
});

describe("logCategoryExposure", () => {
	it("logs exposure without throwing", () => {
		const info = vi.spyOn(console, "info").mockImplementation(() => {});

		logCategoryExposure(42, {
			totalUsd: 10_000,
			exposure: { risk_off: 0.5, neutral: 0.3, risk_on: 0.2 },
		});

		expect(info).toHaveBeenCalledWith(
			expect.stringContaining("Portfolio 42 macro category exposure"),
		);
		expect(
			summarizeCategoryExposure({
				totalUsd: 10_000,
				exposure: { risk_off: 0.5, neutral: 0.3, risk_on: 0.2 },
			}),
		).toContain("risk_off 50.0%");

		info.mockRestore();
	});
});
