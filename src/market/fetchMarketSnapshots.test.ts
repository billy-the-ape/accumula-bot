import { describe, expect, it, vi } from "vitest";
import { getCryptocurrency } from "@/config/assets.js";
import { fetchMarketSnapshots } from "@/market/fetchMarketSnapshots.js";

const coingeckoOptions = {
	baseUrl: "https://api.coingecko.com/api/v3",
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

describe("fetchMarketSnapshots", () => {
	it("fetches and normalizes CoinGecko market data", async () => {
		const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
			const url = String(input);

			if (url.includes("/coins/markets")) {
				return jsonResponse([
					{
						id: "bitcoin",
						symbol: "btc",
						current_price: 98000,
						market_cap: 1_900_000_000_000,
						total_volume: 30_000_000_000,
						price_change_percentage_24h_in_currency: 1.5,
						price_change_percentage_7d_in_currency: 4.2,
						price_change_percentage_30d_in_currency: 11.8,
					},
					{
						id: "solana",
						symbol: "sol",
						current_price: 180,
						market_cap: 85_000_000_000,
						total_volume: 3_000_000_000,
						price_change_percentage_24h_in_currency: 2.1,
						price_change_percentage_7d_in_currency: 6.5,
						price_change_percentage_30d_in_currency: 17.4,
					},
				]);
			}

			if (url.includes("/market_chart")) {
				return jsonResponse({
					total_volumes: [
						[1, 100],
						[2, 110],
						[3, 105],
						[4, 150],
						[5, 160],
						[6, 170],
					],
				});
			}

			throw new Error(`Unexpected fetch: ${url}`);
		});

		const snapshots = await fetchMarketSnapshots(
			[getCryptocurrency("BTC"), getCryptocurrency("SOL")],
			{ ...coingeckoOptions, fetchImpl },
		);

		expect(snapshots).toHaveLength(2);
		expect(snapshots[0]).toMatchObject({
			asset: "BTC",
			priceUsd: 98000,
			change24hPct: 1.5,
			volumeTrend: "rising",
		});
		expect(snapshots[1]?.asset).toBe("SOL");
	});
});
