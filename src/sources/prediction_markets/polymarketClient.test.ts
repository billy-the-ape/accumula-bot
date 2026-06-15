import { describe, expect, it, vi } from "vitest";
import type { PolymarketGammaMarket } from "@/schemas/PolymarketMarket.js";
import {
	fetchPolymarketSignal,
	getGammaYesPrice,
	getYesTokenId,
	PolymarketError,
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
