import { describe, expect, it, vi } from "vitest";
import type { PolymarketGammaMarket } from "@/schemas/PolymarketMarket.js";
import {
	buildPolymarketLadderRungs,
	DEFAULT_POLYMARKET_LADDER_SCORING,
	fetchPolymarketEventMarkets,
	fetchPolymarketSignal,
	getGammaYesPrice,
	getPolymarketStrike,
	getYesTokenId,
	PolymarketError,
	polymarketMarketToLadderRung,
	selectMarketsAtHorizon,
} from "@/sources/prediction_markets/polymarketClient.js";

const options = {
	gammaBaseUrl: "https://gamma-api.polymarket.com",
	clobBaseUrl: "https://clob.polymarket.com",
};
const now = new Date("2026-06-15T12:00:00.000Z");

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function ladderMarket(
	strike: number,
	yesPrice: string,
	liquidityNum: number,
): PolymarketGammaMarket {
	return {
		id: `id-${strike}`,
		question: `Will the price of Bitcoin be above $${strike.toLocaleString("en-US")} on Jun 16?`,
		conditionId: `0xstrike${strike}`,
		endDate: "2026-06-16T12:00:00.000Z",
		closed: false,
		enableOrderBook: true,
		liquidityNum,
		clobTokenIds: '["yes", "no"]',
		outcomePrices: `["${yesPrice}", "0.01"]`,
		outcomes: '["Yes", "No"]',
	} as PolymarketGammaMarket;
}

const ladderMarkets = [
	ladderMarket(95_000, "0.92", 4_000),
	ladderMarket(100_000, "0.82", 5_000),
	ladderMarket(105_000, "0.32", 5_000),
	ladderMarket(110_000, "0.10", 2_000),
];

describe("fetchPolymarketSignal", () => {
	it("scores the implied distribution from Gamma outcome prices near spot", async () => {
		const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
			const url = String(input);
			expect(url).toContain("/markets");
			return jsonResponse(ladderMarkets);
		});

		const signal = await fetchPolymarketSignal(
			{ ...options, fetchImpl },
			{
				asset: "BTC",
				targetHorizonHours: 24,
				spotPriceUsd: 100_000,
				now,
			},
		);

		expect(
			fetchImpl.mock.calls.every((call) => !String(call[0]).includes("clob")),
		).toBe(true);
		expect(signal).toMatchObject({
			asset: "BTC",
			source: "polymarket",
			impliedUpProbability: 0.75,
			horizonHours: 24,
			liquidityUsd: 16_000,
			asOf: now.toISOString(),
			marketRef: "0xstrike100000",
			modeStrikeUsd: 102_500,
			spotUsd: 100_000,
		});
		expect(signal?.modeBucketProbability).toBeCloseTo(0.5, 10);
	});

	it("returns null when spot is missing or invalid", async () => {
		const fetchImpl = vi.fn(async () => jsonResponse(ladderMarkets));

		await expect(
			fetchPolymarketSignal(
				{ ...options, fetchImpl },
				{
					asset: "BTC",
					spotPriceUsd: 0,
					now,
				},
			),
		).resolves.toBeNull();
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("returns null when fewer than minRungs qualify", async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse([ladderMarket(100_000, "0.82", 5_000)]),
		);

		const signal = await fetchPolymarketSignal(
			{ ...options, fetchImpl },
			{
				asset: "BTC",
				spotPriceUsd: 100_000,
				now,
				scoring: { ...DEFAULT_POLYMARKET_LADDER_SCORING, minRungs: 3 },
			},
		);

		expect(signal).toBeNull();
	});

	it("returns null when gamma returns no markets", async () => {
		const fetchImpl = vi.fn(async () => jsonResponse([]));

		const signal = await fetchPolymarketSignal(
			{ ...options, fetchImpl },
			{ asset: "BTC", spotPriceUsd: 100_000, now },
		);

		expect(signal).toBeNull();
	});

	it("throws PolymarketError when gamma responds non-OK", async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({ error: "boom" }, 500));

		await expect(
			fetchPolymarketSignal(
				{ ...options, fetchImpl },
				{ asset: "BTC", spotPriceUsd: 100_000, now },
			),
		).rejects.toBeInstanceOf(PolymarketError);
	});
});

const sampleMarket = ladderMarkets[0] as PolymarketGammaMarket;

describe("getYesTokenId", () => {
	it("parses the YES token id from a JSON-encoded clobTokenIds string", () => {
		expect(getYesTokenId(sampleMarket)).toBe("yes");
	});

	it("returns null when token ids are missing", () => {
		expect(
			getYesTokenId({ ...sampleMarket, clobTokenIds: undefined }),
		).toBeNull();
	});
});

describe("getGammaYesPrice", () => {
	it("parses the YES price from JSON-encoded outcomePrices", () => {
		expect(getGammaYesPrice(sampleMarket)).toBe(0.92);
	});

	it("returns null when prices are unusable", () => {
		expect(
			getGammaYesPrice({ ...sampleMarket, outcomePrices: '["0", "1"]' }),
		).toBeNull();
	});
});

describe("getPolymarketStrike", () => {
	it("parses a USD strike from a threshold question", () => {
		expect(
			getPolymarketStrike({
				question: "Will the price of Bitcoin be above $68,000 on June 16?",
			} as PolymarketGammaMarket),
		).toBe(68_000);
	});

	it("parses k/m suffixes", () => {
		expect(
			getPolymarketStrike({
				question: "Will bitcoin hit $1m before GTA VI?",
			} as PolymarketGammaMarket),
		).toBe(1_000_000);
	});

	it("returns null for a genuine up/down market with no strike", () => {
		expect(
			getPolymarketStrike({
				question: "Will Bitcoin be up on Jun 16?",
			} as PolymarketGammaMarket),
		).toBeNull();
	});
});

describe("polymarketMarketToLadderRung", () => {
	it("maps a threshold market to a normalized ladder rung", () => {
		expect(
			polymarketMarketToLadderRung(ladderMarkets[1] as PolymarketGammaMarket),
		).toEqual({
			strikeUsd: 100_000,
			probabilityAbove: 0.82,
			liquidityUsd: 5_000,
			marketRef: "0xstrike100000",
		});
	});
});

describe("selectMarketsAtHorizon", () => {
	it("returns all ladder rungs at the expiry nearest the target horizon", () => {
		const selected = selectMarketsAtHorizon(ladderMarkets, {
			nowMs: now.getTime(),
			targetHorizonHours: 24,
		});
		expect(selected).toHaveLength(4);
	});

	it("returns an empty array when nothing falls within the horizon window", () => {
		const selected = selectMarketsAtHorizon(ladderMarkets, {
			nowMs: now.getTime(),
			targetHorizonHours: 24,
			maxHorizonHours: 1,
		});
		expect(selected).toEqual([]);
	});
});

describe("buildPolymarketLadderRungs", () => {
	it("drops markets without a parseable strike", () => {
		const rungs = buildPolymarketLadderRungs([
			ladderMarkets[1] as PolymarketGammaMarket,
			{
				...sampleMarket,
				question: "Will Bitcoin be up on Jun 16?",
			} as PolymarketGammaMarket,
		]);
		expect(rungs).toHaveLength(1);
	});
});

const eventsResponse = [
	{
		title: "Bitcoin above ___ on June 16?",
		slug: "bitcoin-above-on-june-16-2026",
		closed: false,
		markets: ladderMarkets,
	},
	{
		title: "o1 FDV above ___ one day after launch?",
		slug: "o1-fdv-above",
		closed: false,
		markets: [ladderMarket(5_000_000_000, "0.5", 1_000)],
	},
];

describe("fetchPolymarketEventMarkets", () => {
	it("returns only child markets of open events matching the title prefix", async () => {
		const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
			const url = String(input);
			expect(url).toContain("/events");
			expect(url).toContain("tag_slug=crypto");
			return jsonResponse(eventsResponse);
		});

		const markets = await fetchPolymarketEventMarkets(
			{ ...options, fetchImpl },
			{ tagSlug: "crypto", titlePrefix: "bitcoin above" },
		);

		expect(markets.map((m) => m.conditionId)).toEqual([
			"0xstrike95000",
			"0xstrike100000",
			"0xstrike105000",
			"0xstrike110000",
		]);
	});
});

describe("fetchPolymarketSignal (event discovery)", () => {
	it("discovers the ladder via /events and scores the implied distribution", async () => {
		const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
			const url = String(input);
			if (url.includes("gamma-api") && url.includes("/events")) {
				return jsonResponse(eventsResponse);
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		const signal = await fetchPolymarketSignal(
			{ ...options, fetchImpl },
			{
				asset: "BTC",
				event: { tagSlug: "crypto", titlePrefix: "bitcoin above" },
				targetHorizonHours: 24,
				now,
				spotPriceUsd: 100_000,
			},
		);

		expect(signal?.marketRef).toBe("0xstrike100000");
		expect(signal?.impliedUpProbability).toBe(0.75);
		expect(signal?.modeStrikeUsd).toBe(102_500);
	});
});
