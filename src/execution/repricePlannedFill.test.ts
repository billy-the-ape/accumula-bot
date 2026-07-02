import { describe, expect, it } from "vitest";
import { repricePlannedFill } from "@/execution/repricePlannedFill.js";

const marketSnapshots = [
	{
		asset: "LINK",
		priceUsd: 16,
		change24hPct: 1,
		change7dPct: 2,
		change30dPct: 3,
		volumeTrend: "flat" as const,
		marketCapUsd: 100_000,
	},
	{
		asset: "BTC",
		priceUsd: 100_000,
		change24hPct: 1,
		change7dPct: 2,
		change30dPct: 3,
		volumeTrend: "flat" as const,
		marketCapUsd: 1_000_000,
	},
];

describe("repricePlannedFill", () => {
	it("preserves buy notional when the fresh price moves", () => {
		const repriced = repricePlannedFill(
			{
				side: "buy",
				symbol: "LINK",
				quantity: 10,
				priceUsd: 15,
			},
			marketSnapshots,
			"USDC",
			"BTC",
		);

		expect(repriced.priceUsd).toBe(16);
		expect(repriced.quantity).toBeCloseTo(9.375, 5);
		expect(repriced.quantity * repriced.priceUsd).toBeCloseTo(150, 5);
	});

	it("updates sell price without changing quantity", () => {
		const repriced = repricePlannedFill(
			{
				side: "sell",
				symbol: "LINK",
				quantity: 5,
				priceUsd: 15,
			},
			marketSnapshots,
			"USDC",
			"BTC",
		);

		expect(repriced.priceUsd).toBe(16);
		expect(repriced.quantity).toBe(5);
	});
});
