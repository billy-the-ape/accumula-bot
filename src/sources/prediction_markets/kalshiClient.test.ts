import { describe, expect, it, vi } from "vitest";
import type { KalshiMarket } from "@/schemas/KalshiMarket.js";
import {
	deriveImpliedUpProbability,
	fetchKalshiSignal,
	KalshiError,
	selectMarketNearestHorizon,
} from "@/sources/prediction_markets/kalshiClient.js";

const baseUrl = "https://external-api.kalshi.com/trade-api/v2";
const now = new Date("2026-06-15T12:00:00.000Z");

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

// Trimmed Kalshi GET /markets response: three open BTC markets at different
// horizons. Prices are dollar strings where the YES price = implied probability.
const marketsFixture = {
	cursor: "",
	markets: [
		{
			ticker: "KXBTCD-26JUN15-T1H",
			event_ticker: "KXBTCD-26JUN15",
			status: "active",
			close_time: "2026-06-15T13:00:00.000Z", // +1h
			yes_bid_dollars: "0.50",
			yes_ask_dollars: "0.52",
			last_price_dollars: "0.51",
			volume_24h_fp: "2000.00",
			notional_value_dollars: "1.0000",
			yes_sub_title: "Up at 1pm",
		},
		{
			ticker: "KXBTCD-26JUN16-UP",
			event_ticker: "KXBTCD-26JUN16",
			status: "active",
			close_time: "2026-06-16T12:00:00.000Z", // +24h (target)
			yes_bid_dollars: "0.56",
			yes_ask_dollars: "0.60",
			last_price_dollars: "0.58",
			volume_24h_fp: "10000.00",
			notional_value_dollars: "1.0000",
			yes_sub_title: "Up tomorrow",
		},
		{
			ticker: "KXBTCD-26JUN17-UP",
			event_ticker: "KXBTCD-26JUN17",
			status: "active",
			close_time: "2026-06-17T12:00:00.000Z", // +48h
			yes_bid_dollars: "0.00",
			yes_ask_dollars: "0.00",
			last_price_dollars: "0.40",
			volume_24h_fp: "500.00",
			notional_value_dollars: "1.0000",
			yes_sub_title: "Up in two days",
		},
	],
};

describe("fetchKalshiSignal", () => {
	it("selects the open market nearest the target horizon and normalizes it", async () => {
		const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
			const url = String(input);
			expect(url).toContain("/markets");
			expect(url).toContain("series_ticker=KXBTCD");
			expect(url).toContain("status=open");
			return jsonResponse(marketsFixture);
		});

		const signal = await fetchKalshiSignal(
			{ baseUrl, fetchImpl },
			{ asset: "BTC", seriesTicker: "KXBTCD", targetHorizonHours: 24, now },
		);

		expect(signal).toEqual({
			asset: "BTC",
			source: "kalshi",
			impliedUpProbability: 0.58, // mid of 0.56 / 0.60
			horizonHours: 24,
			liquidityUsd: 10_000, // volume_24h * notional
			asOf: now.toISOString(),
			marketRef: "KXBTCD-26JUN16-UP",
		});
	});

	it("returns null when no open markets are available", async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse({ cursor: "", markets: [] }),
		);

		const signal = await fetchKalshiSignal(
			{ baseUrl, fetchImpl },
			{ asset: "BTC", seriesTicker: "KXBTCD", now },
		);

		expect(signal).toBeNull();
	});

	it("throws KalshiError on a non-OK response", async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({ error: "nope" }, 500));

		await expect(
			fetchKalshiSignal(
				{ baseUrl, fetchImpl },
				{ asset: "BTC", seriesTicker: "KXBTCD", now },
			),
		).rejects.toBeInstanceOf(KalshiError);
	});
});

const numericMarket: KalshiMarket = {
	ticker: "KXBTCD-26JUN16-UP",
	event_ticker: "KXBTCD-26JUN16",
	status: "active",
	close_time: "2026-06-16T12:00:00.000Z",
	yes_bid_dollars: 0.56,
	yes_ask_dollars: 0.6,
	last_price_dollars: 0.58,
	volume_24h_fp: 10_000,
	notional_value_dollars: 1,
	yes_sub_title: "Up tomorrow",
};

describe("deriveImpliedUpProbability", () => {
	it("uses the yes bid/ask midpoint when both are present", () => {
		expect(deriveImpliedUpProbability(numericMarket)).toBeCloseTo(0.58, 10);
	});

	it("falls back to last price when bid/ask are absent", () => {
		expect(
			deriveImpliedUpProbability({
				...numericMarket,
				yes_bid_dollars: 0,
				yes_ask_dollars: 0,
				last_price_dollars: 0.4,
			}),
		).toBeCloseTo(0.4, 10);
	});

	it("returns null when no price is available", () => {
		expect(
			deriveImpliedUpProbability({
				...numericMarket,
				yes_bid_dollars: 0,
				yes_ask_dollars: 0,
				last_price_dollars: 0,
			}),
		).toBeNull();
	});
});

describe("selectMarketNearestHorizon", () => {
	it("ignores markets that already closed", () => {
		const selected = selectMarketNearestHorizon(
			[
				{
					...numericMarket,
					close_time: "2026-06-15T11:00:00.000Z", // already past `now`
				},
			],
			now.getTime(),
			24,
		);
		expect(selected).toBeNull();
	});
});
