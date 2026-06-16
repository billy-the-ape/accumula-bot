import { describe, expect, it, vi } from "vitest";
import type { KalshiMarket } from "@/schemas/KalshiMarket.js";
import {
	buildKalshiLadderRungs,
	DEFAULT_KALSHI_LADDER_SCORING,
	deriveImpliedUpProbability,
	fetchKalshiSignal,
	getKalshiStrike,
	KalshiError,
	kalshiMarketToLadderRung,
	selectMarketsAtHorizon,
} from "@/sources/prediction_markets/kalshiClient.js";

const baseUrl = "https://external-api.kalshi.com/trade-api/v2";
const now = new Date("2026-06-15T12:00:00.000Z");

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

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

const ladderFixture = {
	cursor: "",
	markets: [
		ladderRung(95_000, 0.9, 0.92, 1_000),
		ladderRung(100_000, 0.8, 0.82, 5_000),
		ladderRung(105_000, 0.28, 0.32, 5_000),
		ladderRung(110_000, 0.08, 0.1, 2_000),
	],
};

describe("fetchKalshiSignal", () => {
	it("scores the implied distribution from rungs near spot at the target horizon", async () => {
		const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
			const url = String(input);
			expect(url).toContain("/markets");
			expect(url).toContain("series_ticker=KXBTCD");
			expect(url).toContain("status=open");
			return jsonResponse(ladderFixture);
		});

		const signal = await fetchKalshiSignal(
			{ baseUrl, fetchImpl },
			{
				asset: "BTC",
				seriesTicker: "KXBTCD",
				targetHorizonHours: 24,
				spotPriceUsd: 100_000,
				now,
			},
		);

		expect(signal).toEqual({
			asset: "BTC",
			source: "kalshi",
			impliedUpProbability: 0.75,
			horizonHours: 24,
			liquidityUsd: 13_000,
			asOf: now.toISOString(),
			marketRef: "KXBTCD-26JUN16-T100000",
			modeStrikeUsd: 102_500,
			spotUsd: 100_000,
			modeBucketProbability: 0.51,
		});
	});

	it("returns null when spot is missing or invalid", async () => {
		const fetchImpl = vi.fn(async () => jsonResponse(ladderFixture));

		await expect(
			fetchKalshiSignal(
				{ baseUrl, fetchImpl },
				{
					asset: "BTC",
					seriesTicker: "KXBTCD",
					spotPriceUsd: 0,
					now,
				},
			),
		).resolves.toBeNull();
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("returns null when fewer than minRungs qualify", async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse({
				cursor: "",
				markets: [ladderRung(100_000, 0.8, 0.82, 5_000)],
			}),
		);

		const signal = await fetchKalshiSignal(
			{ baseUrl, fetchImpl },
			{
				asset: "BTC",
				seriesTicker: "KXBTCD",
				spotPriceUsd: 100_000,
				now,
				scoring: { ...DEFAULT_KALSHI_LADDER_SCORING, minRungs: 3 },
			},
		);

		expect(signal).toBeNull();
	});

	it("returns null when no open markets are available", async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse({ cursor: "", markets: [] }),
		);

		const signal = await fetchKalshiSignal(
			{ baseUrl, fetchImpl },
			{
				asset: "BTC",
				seriesTicker: "KXBTCD",
				spotPriceUsd: 100_000,
				now,
			},
		);

		expect(signal).toBeNull();
	});

	it("throws KalshiError on a non-OK response", async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({ error: "nope" }, 500));

		await expect(
			fetchKalshiSignal(
				{ baseUrl, fetchImpl },
				{
					asset: "BTC",
					seriesTicker: "KXBTCD",
					spotPriceUsd: 100_000,
					now,
				},
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

describe("kalshiMarketToLadderRung", () => {
	it("maps a market to a normalized ladder rung", () => {
		expect(kalshiMarketToLadderRung(ladder[1] as KalshiMarket)).toEqual({
			strikeUsd: 65_000,
			probabilityAbove: 0.51,
			liquidityUsd: 5_000,
			marketRef: "KXBTCD-26JUN16-T65000",
		});
	});
});

describe("selectMarketsAtHorizon", () => {
	it("returns all ladder rungs at the expiry nearest the target horizon", () => {
		const selected = selectMarketsAtHorizon(ladder, {
			nowMs: now.getTime(),
			targetHorizonHours: 24,
		});
		expect(selected).toHaveLength(3);
		expect(selected.every((m) => m.close_time === ladder[0]?.close_time)).toBe(
			true,
		);
	});

	it("returns an empty array when nothing falls within the horizon window", () => {
		const selected = selectMarketsAtHorizon(ladder, {
			nowMs: now.getTime(),
			targetHorizonHours: 24,
			maxHorizonHours: 1,
		});
		expect(selected).toEqual([]);
	});
});

describe("buildKalshiLadderRungs", () => {
	it("drops markets without a usable strike or price", () => {
		const rungs = buildKalshiLadderRungs([
			ladder[1] as KalshiMarket,
			{
				...numericMarket,
				floor_strike: null,
				cap_strike: null,
				ticker: "KXBTCD-26JUN16-NOSTRIKE",
			},
		]);
		expect(rungs).toHaveLength(1);
	});
});
