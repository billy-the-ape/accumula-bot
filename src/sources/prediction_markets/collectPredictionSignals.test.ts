import { describe, expect, it, vi } from "vitest";
import { getCryptocurrency } from "@/config/assets.js";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import type { PredictionSignal } from "@/schemas/PredictionSignal.js";
import { collectPredictionSignals } from "@/sources/prediction_markets/collectPredictionSignals.js";
import type {
	FetchKalshiSignalParams,
	KalshiClientOptions,
} from "@/sources/prediction_markets/kalshiClient.js";
import type {
	FetchPolymarketSignalParams,
	PolymarketClientOptions,
} from "@/sources/prediction_markets/polymarketClient.js";

const now = new Date("2026-06-15T12:00:00.000Z");

function makeConfig() {
	return loadTestConfig({
		ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
		LLM_BASE_URL: "http://127.0.0.1:11434",
		PREDICTION_MARKETS_ENABLED: "true",
	});
}

const btcKalshi: PredictionSignal = {
	asset: "BTC",
	source: "kalshi",
	impliedUpProbability: 0.58,
	horizonHours: 24,
	liquidityUsd: 10_000,
	asOf: now.toISOString(),
	marketRef: "KXBTCD-26JUN16-UP",
};

const btcPolymarket: PredictionSignal = {
	asset: "BTC",
	source: "polymarket",
	impliedUpProbability: 0.62,
	horizonHours: 24,
	liquidityUsd: 50_000,
	asOf: now.toISOString(),
	marketRef: "0xcondA",
};

describe("collectPredictionSignals", () => {
	it("aggregates mapped assets, skips unmapped, and degrades on failure", async () => {
		const fetchKalshiSignal = vi.fn(
			async (
				_options: KalshiClientOptions,
				params: FetchKalshiSignalParams,
			): Promise<PredictionSignal | null> => {
				if (params.asset === "BTC") return btcKalshi;
				if (params.asset === "ETH") throw new Error("kalshi unavailable");
				return null;
			},
		);
		const fetchPolymarketSignal = vi.fn(
			async (
				_options: PolymarketClientOptions,
				params: FetchPolymarketSignalParams,
			): Promise<PredictionSignal | null> => {
				if (params.asset === "BTC") return btcPolymarket;
				return null;
			},
		);

		const config = makeConfig();
		const assets = [
			getCryptocurrency("BTC"),
			getCryptocurrency("ETH"),
			getCryptocurrency("SOL"),
		];

		const signals = await collectPredictionSignals(config, assets, {
			fetchKalshiSignal,
			fetchPolymarketSignal,
			now,
			spotPrices: { BTC: 64_000, ETH: 3_000, SOL: 150 },
		});

		// BTC from both venues; ETH kalshi threw (→ dropped), ETH poly null; SOL unmapped
		expect(signals).toEqual([btcKalshi, btcPolymarket]);

		// Only mapped assets (BTC, ETH) trigger venue calls — SOL is skipped
		const kalshiAssets = fetchKalshiSignal.mock.calls.map(
			(call) => call[1].asset,
		);
		expect(kalshiAssets).toEqual(["BTC", "ETH", "SOL"]);

		// `now` is threaded through to the venue clients
		expect(fetchKalshiSignal.mock.calls[0]?.[1].now).toBe(now);
		expect(fetchPolymarketSignal.mock.calls[0]?.[1].now).toBe(now);
	});

	it("threads per-asset spot price and scoring config into both venues", async () => {
		const fetchKalshiSignal = vi.fn(
			async (
				_options: KalshiClientOptions,
				_params: FetchKalshiSignalParams,
			): Promise<PredictionSignal | null> => null,
		);
		const fetchPolymarketSignal = vi.fn(
			async (
				_options: PolymarketClientOptions,
				_params: FetchPolymarketSignalParams,
			): Promise<PredictionSignal | null> => null,
		);

		const config = makeConfig();
		await collectPredictionSignals(config, [getCryptocurrency("BTC")], {
			fetchKalshiSignal,
			fetchPolymarketSignal,
			now,
			spotPrices: { BTC: 64_000 },
		});

		expect(fetchKalshiSignal.mock.calls[0]?.[1].spotPriceUsd).toBe(64_000);
		expect(fetchKalshiSignal.mock.calls[0]?.[1].scoring).toEqual(
			config.predictionMarkets.scoring,
		);
		expect(fetchPolymarketSignal.mock.calls[0]?.[1].spotPriceUsd).toBe(64_000);
		expect(fetchPolymarketSignal.mock.calls[0]?.[1].scoring).toEqual(
			config.predictionMarkets.scoring,
		);
		expect(fetchPolymarketSignal.mock.calls[0]?.[1].event).toEqual({
			tagSlug: "crypto",
			titlePrefix: "bitcoin above",
		});
	});

	it("skips mapped assets when spot is unavailable", async () => {
		const fetchKalshiSignal = vi.fn();
		const fetchPolymarketSignal = vi.fn();

		await collectPredictionSignals(makeConfig(), [getCryptocurrency("BTC")], {
			fetchKalshiSignal,
			fetchPolymarketSignal,
			now,
		});

		expect(fetchKalshiSignal).not.toHaveBeenCalled();
		expect(fetchPolymarketSignal).not.toHaveBeenCalled();
	});

	it("returns an empty array when no assets are mapped", async () => {
		const fetchKalshiSignal = vi.fn();
		const fetchPolymarketSignal = vi.fn();

		const signals = await collectPredictionSignals(
			makeConfig(),
			[getCryptocurrency("USDC")],
			{ fetchKalshiSignal, fetchPolymarketSignal, now },
		);

		expect(signals).toEqual([]);
		expect(fetchKalshiSignal).not.toHaveBeenCalled();
		expect(fetchPolymarketSignal).not.toHaveBeenCalled();
	});
});
