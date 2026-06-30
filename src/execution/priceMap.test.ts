import { describe, expect, it } from "vitest";
import { buildPriceMap } from "@/execution/priceMap.js";

const marketSnapshots = [
	{
		asset: "BTC",
		priceUsd: 100_000,
		change24hPct: 1,
		change7dPct: 2,
		change30dPct: 3,
		volumeTrend: "flat" as const,
		marketCapUsd: 1_000_000,
	},
	{
		asset: "ETH",
		priceUsd: 3_000,
		change24hPct: 1,
		change7dPct: 2,
		change30dPct: 3,
		volumeTrend: "flat" as const,
		marketCapUsd: 500_000,
	},
];

describe("buildPriceMap", () => {
	it("pins the cash symbol to 1 USD", () => {
		const prices = buildPriceMap(marketSnapshots, "USDC");

		expect(prices.USDC).toBe(1);
		expect(prices.BTC).toBe(100_000);
	});

	it("prices the accumulation asset from market snapshots when available", () => {
		const prices = buildPriceMap(marketSnapshots, "USDC", {
			accumulateSymbol: "ETH",
		});

		expect(prices.ETH).toBe(3_000);
	});

	it("pins a stable accumulation asset to 1 when it matches cash", () => {
		const prices = buildPriceMap(marketSnapshots, "USDC", {
			accumulateSymbol: "USDC",
		});

		expect(prices.USDC).toBe(1);
	});
});
