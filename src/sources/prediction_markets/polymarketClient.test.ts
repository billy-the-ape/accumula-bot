import { describe, expect, it, vi } from "vitest";
import type { PolymarketGammaMarket } from "@/schemas/PolymarketMarket.js";
import {
	fetchPolymarketEventMarkets,
	fetchPolymarketSignal,
	getGammaYesPrice,
	getPolymarketStrike,
	getYesTokenId,
	PolymarketError,
	selectAtmMarket,
	selectMarketNearestHorizon,
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

// Trimmed Gamma /markets response. clobTokenIds / outcomePrices are
// JSON-encoded strings (index 0 = Yes), as Gamma actually returns them.
const gammaMarkets = [
	{
		id: "501",
		question: "Will Bitcoin be up on Jun 16?",
		slug: "bitcoin-up-or-down-jun16",
		conditionId: "0xcondA",
		endDate: "2026-06-16T12:00:00.000Z", // +24h (target)
		active: true,
		closed: false,
		enableOrderBook: true,
		liquidityNum: 50_000,
		clobTokenIds: '["111", "222"]',
		outcomePrices: '["0.61", "0.39"]',
		outcomes: '["Yes", "No"]',
	},
	{
		id: "502",
		question: "Will Bitcoin be up in the next hour?",
		slug: "bitcoin-up-or-down-1h",
		conditionId: "0xcondB",
		endDate: "2026-06-15T13:00:00.000Z", // +1h
		active: true,
		closed: false,
		enableOrderBook: true,
		liquidityNum: 1_000,
		clobTokenIds: '["333", "444"]',
		outcomePrices: '["0.50", "0.50"]',
		outcomes: '["Yes", "No"]',
	},
	{
		id: "503",
		question: "Will Bitcoin be up on Jun 14? (resolved)",
		slug: "bitcoin-up-or-down-jun14",
		conditionId: "0xcondC",
		endDate: "2026-06-16T18:00:00.000Z",
		active: false,
		closed: true,
		enableOrderBook: true,
		liquidityNum: 9_000,
		clobTokenIds: '["555", "666"]',
		outcomePrices: '["0.55", "0.45"]',
		outcomes: '["Yes", "No"]',
	},
];

function gammaFetch(midpointBody: unknown, midpointStatus = 200) {
	return vi.fn(async (input: Parameters<typeof fetch>[0]) => {
		const url = String(input);
		if (url.includes("gamma-api") && url.includes("/markets")) {
			return jsonResponse(gammaMarkets);
		}
		if (url.includes("clob") && url.includes("/midpoint")) {
			return jsonResponse(midpointBody, midpointStatus);
		}
		throw new Error(`Unexpected fetch: ${url}`);
	});
}

describe("fetchPolymarketSignal", () => {
	it("selects the open market nearest the horizon and prefers the CLOB midpoint", async () => {
		const fetchImpl = gammaFetch({ mid_price: "0.62" });

		const signal = await fetchPolymarketSignal(
			{ ...options, fetchImpl },
			{ asset: "BTC", targetHorizonHours: 24, now },
		);

		// midpoint queried for the YES token of the selected market
		expect(
			fetchImpl.mock.calls.some((call) =>
				String(call[0]).includes("token_id=111"),
			),
		).toBe(true);

		expect(signal).toEqual({
			asset: "BTC",
			source: "polymarket",
			impliedUpProbability: 0.62, // CLOB midpoint overrides gamma's 0.61
			horizonHours: 24,
			liquidityUsd: 50_000,
			asOf: now.toISOString(),
			marketRef: "0xcondA",
		});
	});

	it("falls back to the gamma outcome price when no orderbook midpoint exists", async () => {
		const fetchImpl = gammaFetch(
			{ error: "No orderbook exists for the requested token id" },
			404,
		);

		const signal = await fetchPolymarketSignal(
			{ ...options, fetchImpl },
			{ asset: "BTC", targetHorizonHours: 24, now },
		);

		expect(signal?.impliedUpProbability).toBe(0.61);
	});

	it("returns null when gamma returns no markets", async () => {
		const fetchImpl = vi.fn(async () => jsonResponse([]));

		const signal = await fetchPolymarketSignal(
			{ ...options, fetchImpl },
			{ asset: "BTC", now },
		);

		expect(signal).toBeNull();
	});

	it("throws PolymarketError when gamma responds non-OK", async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({ error: "boom" }, 500));

		await expect(
			fetchPolymarketSignal({ ...options, fetchImpl }, { asset: "BTC", now }),
		).rejects.toBeInstanceOf(PolymarketError);
	});
});

const sampleMarket = gammaMarkets[0] as PolymarketGammaMarket;

describe("getYesTokenId", () => {
	it("parses the YES token id from a JSON-encoded clobTokenIds string", () => {
		expect(getYesTokenId(sampleMarket)).toBe("111");
	});

	it("returns null when token ids are missing", () => {
		expect(
			getYesTokenId({ ...sampleMarket, clobTokenIds: undefined }),
		).toBeNull();
	});
});

describe("getGammaYesPrice", () => {
	it("parses the YES price from JSON-encoded outcomePrices", () => {
		expect(getGammaYesPrice(sampleMarket)).toBe(0.61);
	});

	it("returns null when prices are unusable", () => {
		expect(
			getGammaYesPrice({ ...sampleMarket, outcomePrices: '["0", "1"]' }),
		).toBeNull();
	});
});

describe("selectMarketNearestHorizon", () => {
	it("excludes closed markets", () => {
		const closedOnly = [gammaMarkets[2] as PolymarketGammaMarket];
		expect(
			selectMarketNearestHorizon(closedOnly, now.getTime(), 24),
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

// A "≥ strike" ladder all sharing the same +24h expiry, as Polymarket lists
// BTC price markets ("Will the price of Bitcoin be above $X on Jun 16?").
const ladderMarkets = [
	{
		id: "601",
		question: "Will the price of Bitcoin be above $60,000 on Jun 16?",
		conditionId: "0xstrike60",
		endDate: "2026-06-16T12:00:00.000Z",
		closed: false,
		enableOrderBook: true,
		liquidityNum: 4_000,
		clobTokenIds: '["60y", "60n"]',
		outcomePrices: '["0.92", "0.08"]',
		outcomes: '["Yes", "No"]',
	},
	{
		id: "602",
		question: "Will the price of Bitcoin be above $65,000 on Jun 16?",
		conditionId: "0xstrike65",
		endDate: "2026-06-16T12:00:00.000Z",
		closed: false,
		enableOrderBook: true,
		liquidityNum: 8_000,
		clobTokenIds: '["65y", "65n"]',
		outcomePrices: '["0.50", "0.50"]',
		outcomes: '["Yes", "No"]',
	},
	{
		id: "603",
		question: "Will the price of Bitcoin be above $70,000 on Jun 16?",
		conditionId: "0xstrike70",
		endDate: "2026-06-16T12:00:00.000Z",
		closed: false,
		enableOrderBook: true,
		liquidityNum: 5_000,
		clobTokenIds: '["70y", "70n"]',
		outcomePrices: '["0.08", "0.92"]',
		outcomes: '["Yes", "No"]',
	},
] as PolymarketGammaMarket[];

describe("selectAtmMarket", () => {
	it("picks the rung whose strike is closest to spot", () => {
		const market = selectAtmMarket(ladderMarkets, {
			nowMs: now.getTime(),
			targetHorizonHours: 24,
			spotPriceUsd: 64_000,
		});
		expect(market?.conditionId).toBe("0xstrike65");
	});

	it("prefers a genuine up/down market (no strike) over the nearest rung", () => {
		const upDown = {
			id: "604",
			question: "Will Bitcoin be up on Jun 16?",
			conditionId: "0xupdown",
			endDate: "2026-06-16T12:00:00.000Z",
			closed: false,
			enableOrderBook: true,
			liquidityNum: 3_000,
			clobTokenIds: '["udy", "udn"]',
			outcomePrices: '["0.55", "0.45"]',
			outcomes: '["Yes", "No"]',
		} as PolymarketGammaMarket;

		const market = selectAtmMarket([...ladderMarkets, upDown], {
			nowMs: now.getTime(),
			targetHorizonHours: 24,
			spotPriceUsd: 65_000,
		});
		expect(market?.conditionId).toBe("0xupdown");
	});

	it("returns null when nothing is within the horizon window", () => {
		const market = selectAtmMarket(ladderMarkets, {
			nowMs: now.getTime(),
			targetHorizonHours: 24,
			spotPriceUsd: 65_000,
			maxHorizonHours: 1,
		});
		expect(market).toBeNull();
	});
});

// Gamma /events response: the asset's daily ladder, an unrelated FDV "above"
// event, a different-asset ladder, and a closed (stale) ladder.
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
		markets: [
			{
				id: "900",
				question: "Will o1 FDV be above $5,000,000,000?",
				conditionId: "0xfdv",
				endDate: "2026-06-16T12:00:00.000Z",
				closed: false,
				enableOrderBook: true,
				liquidityNum: 1_000,
				clobTokenIds: '["fdvy", "fdvn"]',
				outcomePrices: '["0.5", "0.5"]',
				outcomes: '["Yes", "No"]',
			},
		],
	},
	{
		title: "Ethereum above ___ on June 16?",
		slug: "ethereum-above-on-june-16-2026",
		closed: false,
		markets: [
			{
				id: "800",
				question: "Will the price of Ethereum be above $3,000 on June 16?",
				conditionId: "0xeth",
				endDate: "2026-06-16T12:00:00.000Z",
				closed: false,
				enableOrderBook: true,
				liquidityNum: 2_000,
				clobTokenIds: '["ethy", "ethn"]',
				outcomePrices: '["0.5", "0.5"]',
				outcomes: '["Yes", "No"]',
			},
		],
	},
	{
		title: "Bitcoin above ___ on June 10? (resolved)",
		slug: "bitcoin-above-on-june-10-2026",
		closed: true,
		markets: [
			{
				id: "700",
				question: "Will the price of Bitcoin be above $60,000 on June 10?",
				conditionId: "0xstale",
				endDate: "2026-06-10T12:00:00.000Z",
				closed: true,
				enableOrderBook: true,
				liquidityNum: 9_000,
				clobTokenIds: '["sy", "sn"]',
				outcomePrices: '["0.5", "0.5"]',
				outcomes: '["Yes", "No"]',
			},
		],
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

		// only the open "Bitcoin above ___ on June 16?" ladder (3 rungs);
		// FDV / Ethereum / closed-stale events are excluded
		expect(markets.map((m) => m.conditionId)).toEqual([
			"0xstrike60",
			"0xstrike65",
			"0xstrike70",
		]);
	});
});

describe("fetchPolymarketSignal (event discovery)", () => {
	it("discovers the ladder via /events and selects the ATM rung", async () => {
		const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
			const url = String(input);
			if (url.includes("gamma-api") && url.includes("/events")) {
				return jsonResponse(eventsResponse);
			}
			if (url.includes("clob") && url.includes("/midpoint")) {
				return url.includes("token_id=65y")
					? jsonResponse({ mid_price: "0.49" })
					: jsonResponse({ error: "no orderbook" }, 404);
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
				spotPriceUsd: 65_000,
			},
		);

		expect(signal?.marketRef).toBe("0xstrike65");
		expect(signal?.impliedUpProbability).toBe(0.49);
	});
});

describe("fetchPolymarketSignal (ATM path)", () => {
	it("selects the at-the-money rung when spot is provided", async () => {
		const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
			const url = String(input);
			if (url.includes("gamma-api") && url.includes("/markets")) {
				return jsonResponse(ladderMarkets);
			}
			if (url.includes("clob") && url.includes("/midpoint")) {
				// freshest price for the ~spot ($65k) rung's YES token
				return url.includes("token_id=65y")
					? jsonResponse({ mid_price: "0.51" })
					: jsonResponse({ error: "no orderbook" }, 404);
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		const signal = await fetchPolymarketSignal(
			{ ...options, fetchImpl },
			{ asset: "BTC", targetHorizonHours: 24, now, spotPriceUsd: 64_000 },
		);

		expect(signal).toEqual({
			asset: "BTC",
			source: "polymarket",
			impliedUpProbability: 0.51,
			horizonHours: 24,
			liquidityUsd: 8_000,
			asOf: now.toISOString(),
			marketRef: "0xstrike65",
		});
	});
});
