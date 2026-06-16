import { describe, expect, it } from "vitest";
import { getCryptocurrency } from "@/config/assets.js";
import type { PredictionSignal } from "@/schemas/PredictionSignal.js";
import {
	formatCompactUsd,
	formatPredictionSignalDisplay,
	formatPredictionSignals,
} from "@/sources/prediction_markets/formatPredictionSignals.js";

const btcKalshi: PredictionSignal = {
	asset: "BTC",
	source: "kalshi",
	impliedUpProbability: 0.75,
	horizonHours: 23.97,
	liquidityUsd: 10_000,
	asOf: "2026-06-15T12:00:00.000Z",
	marketRef: "KXBTCD-26JUN16-T100000",
	modeStrikeUsd: 102_500,
	spotUsd: 100_000,
	modeBucketProbability: 0.51,
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

const legacyKalshi: PredictionSignal = {
	asset: "BTC",
	source: "kalshi",
	impliedUpProbability: 0.58,
	horizonHours: 24,
	liquidityUsd: 10_000,
	asOf: "2026-06-15T12:00:00.000Z",
	marketRef: "KXBTCD-26JUN16-UP",
};

describe("formatCompactUsd", () => {
	it("formats large values in k/m suffixes", () => {
		expect(formatCompactUsd(102_500)).toBe("$102.5k");
		expect(formatCompactUsd(1_000_000)).toBe("$1.0m");
		expect(formatCompactUsd(75)).toBe("$75");
		expect(formatCompactUsd(150)).toBe("$150");
	});
});

describe("formatPredictionSignalDisplay", () => {
	it("includes mode and spot when debug fields are present", () => {
		expect(formatPredictionSignalDisplay(btcKalshi)).toBe(
			"0.75 📈 (expects $102.5k vs current $100.0k)",
		);
	});

	it("falls back to score and icon only for legacy signals", () => {
		expect(formatPredictionSignalDisplay(legacyKalshi)).toBe("0.58 📈");
	});
});

describe("formatPredictionSignals", () => {
	it("renders one block per asset with mode and spot context", () => {
		const text = formatPredictionSignals(
			[btcKalshi, btcPolymarket],
			[getCryptocurrency("BTC")],
		);

		expect(text).toContain("BTC:");
		expect(text).toContain(
			"kalshi: directional_score=0.75 mode_strike_usd=102500 spot_usd=100000 mode_bucket_probability=0.51 horizon_hours=24 liquidity_usd=10000 (ref KXBTCD-26JUN16-T100000)",
		);
		expect(text).toContain(
			"polymarket: directional_score=0.62 horizon_hours=24 liquidity_usd=50000 (ref 0xcondA)",
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
