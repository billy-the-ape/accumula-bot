import { describe, expect, it } from "vitest";
import { getCryptocurrency } from "@/config/assets.js";
import type { PredictionSignal } from "@/schemas/PredictionSignal.js";
import { formatPredictionSignals } from "@/sources/prediction_markets/formatPredictionSignals.js";

const btcKalshi: PredictionSignal = {
	asset: "BTC",
	source: "kalshi",
	impliedUpProbability: 0.58,
	horizonHours: 23.97,
	liquidityUsd: 10_000,
	asOf: "2026-06-15T12:00:00.000Z",
	marketRef: "KXBTCD-26JUN16-UP",
};

const btcPolymarket: PredictionSignal = {
	asset: "BTC",
	source: "polymarket",
	impliedUpProbability: 0.62,
	horizonHours: 24,
	liquidityUsd: 50_000,
	asOf: "2026-06-15T12:00:00.000Z",
	marketRef: "0xcondA",
};

describe("formatPredictionSignals", () => {
	it("renders one block per asset with both venues", () => {
		const text = formatPredictionSignals(
			[btcKalshi, btcPolymarket],
			[getCryptocurrency("BTC")],
		);

		expect(text).toContain("BTC:");
		expect(text).toContain(
			"kalshi: implied_up_probability=0.58 horizon_hours=24 liquidity_usd=10000 (ref KXBTCD-26JUN16-UP)",
		);
		expect(text).toContain(
			"polymarket: implied_up_probability=0.62 horizon_hours=24 liquidity_usd=50000 (ref 0xcondA)",
		);
	});

	it("marks assets with no signal explicitly", () => {
		const text = formatPredictionSignals(
			[btcKalshi],
			[getCryptocurrency("BTC"), getCryptocurrency("ETH")],
		);

		expect(text).toContain("ETH:\n  no prediction-market signal available");
	});

	it("handles an empty asset list", () => {
		expect(formatPredictionSignals([], [])).toBe(
			"No prediction-market signals available for the requested assets.",
		);
	});
});
