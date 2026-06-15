import { describe, expect, it, vi } from "vitest";
import type { KalshiMarket } from "@/schemas/KalshiMarket.js";
import {
	deriveImpliedUpProbability,
	fetchKalshiSignal,
	getKalshiStrike,
	KalshiError,
	selectAtmMarket,
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

// A "≥ strike" ladder at one expiry (+24h), priced by distance from spot.
function ladderRung(
	strike: number,
	bid: number,
	ask: number,
	volume: number,
): KalshiMarket {
	return {
		ticker: `KXBTCD-26JUN16-T${strike}`,
		event_ticker: "KXBTCD-26JUN16",
		status: "active",
		close_time: "2026-06-16T12:00:00.000Z",
		yes_bid_dollars: bid,
		yes_ask_dollars: ask,
		last_price_dollars: (bid + ask) / 2,
		volume_24h_fp: volume,
		notional_value_dollars: 1,
		yes_sub_title: `Above ${strike}`,
		floor_strike: strike,
	};
}

const ladder: KalshiMarket[] = [
	ladderRung(60_000, 0.9, 0.92, 1_000),
	ladderRung(65_000, 0.49, 0.53, 5_000),
	ladderRung(70_000, 0.08, 0.1, 0),
];

describe("getKalshiStrike", () => {
	it("uses floor_strike when present", () => {
		expect(getKalshiStrike(ladder[1] as KalshiMarket)).toBe(65_000);
	});

	it("falls back to parsing the -T<strike> ticker suffix", () => {
		const market = { ...(ladder[1] as KalshiMarket) };
		market.floor_strike = null;
		expect(getKalshiStrike(market)).toBe(65_000);
	});
});

describe("selectAtmMarket", () => {
	it("picks the rung whose strike is closest to spot", () => {
		const selected = selectAtmMarket(ladder, {
			nowMs: now.getTime(),
			targetHorizonHours: 24,
			spotPriceUsd: 65_000,
		});
		expect(selected?.ticker).toBe("KXBTCD-26JUN16-T65000");
	});

	it("prefers liquid rungs, skipping a zero-liquidity at-the-money strike", () => {
		// Spot sits on the illiquid 70k rung; the liquid 65k rung is chosen instead.
		const selected = selectAtmMarket(ladder, {
			nowMs: now.getTime(),
			targetHorizonHours: 24,
			spotPriceUsd: 70_000,
		});
		expect(selected?.ticker).toBe("KXBTCD-26JUN16-T65000");
	});

	it("returns null when no market falls within the horizon window", () => {
		const selected = selectAtmMarket(ladder, {
			nowMs: now.getTime(),
			targetHorizonHours: 24,
			spotPriceUsd: 65_000,
			maxHorizonHours: 1, // ladder closes in ~24h, outside the 1h window
		});
		expect(selected).toBeNull();
	});
});

describe("fetchKalshiSignal with spot (ATM path)", () => {
	it("normalizes the at-the-money rung into a signal", async () => {
		const ladderResponse = {
			cursor: "",
			markets: [
				{
					ticker: "KXBTCD-26JUN16-T60000",
					status: "active",
					close_time: "2026-06-16T12:00:00.000Z",
					yes_bid_dollars: "0.90",
					yes_ask_dollars: "0.92",
					last_price_dollars: "0.91",
					volume_24h_fp: "1000.00",
					notional_value_dollars: "1.0000",
					floor_strike: 60_000,
				},
				{
					ticker: "KXBTCD-26JUN16-T65000",
					status: "active",
					close_time: "2026-06-16T12:00:00.000Z",
					yes_bid_dollars: "0.49",
					yes_ask_dollars: "0.53",
					last_price_dollars: "0.51",
					volume_24h_fp: "5000.00",
					notional_value_dollars: "1.0000",
					floor_strike: 65_000,
				},
			],
		};
		const fetchImpl = vi.fn(async () => jsonResponse(ladderResponse));

		const signal = await fetchKalshiSignal(
			{ baseUrl, fetchImpl },
			{
				asset: "BTC",
				seriesTicker: "KXBTCD",
				targetHorizonHours: 24,
				spotPriceUsd: 65_000,
				now,
			},
		);

		expect(signal).toEqual({
			asset: "BTC",
			source: "kalshi",
			impliedUpProbability: 0.51, // mid of the ~spot (65k) rung
			horizonHours: 24,
			liquidityUsd: 5_000,
			asOf: now.toISOString(),
			marketRef: "KXBTCD-26JUN16-T65000",
		});
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
