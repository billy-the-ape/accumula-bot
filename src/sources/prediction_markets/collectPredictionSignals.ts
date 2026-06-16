import type { AppConfig } from "@/config/index.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";
import type { PredictionSignal } from "@/schemas/PredictionSignal.js";
import { fetchKalshiSignal } from "@/sources/prediction_markets/kalshiClient.js";
import { getPredictionMarketMapping } from "@/sources/prediction_markets/marketMap.js";
import { fetchPolymarketSignal } from "@/sources/prediction_markets/polymarketClient.js";

export type CollectPredictionSignalsDeps = {
	fetchKalshiSignal?: typeof fetchKalshiSignal;
	fetchPolymarketSignal?: typeof fetchPolymarketSignal;
	now?: Date;
	/**
	 * Current spot price per asset symbol. Required for implied-distribution
	 * scoring on both venues; assets without spot are skipped.
	 */
	spotPrices?: Record<string, number>;
};

/** Run a venue fetch, converting any error into a null (graceful degradation). */
async function safeFetch(
	fetcher: () => Promise<PredictionSignal | null>,
): Promise<PredictionSignal | null> {
	try {
		return await fetcher();
	} catch {
		return null;
	}
}

/**
 * Gather prediction-market signals for the given assets from Kalshi and
 * Polymarket. Assets without a market mapping are skipped; any venue failure or
 * missing market is dropped (never throws). Returns whatever signals exist.
 */
export async function collectPredictionSignals(
	config: AppConfig,
	assets: readonly Cryptocurrency[],
	deps: CollectPredictionSignalsDeps = {},
): Promise<PredictionSignal[]> {
	const kalshi = deps.fetchKalshiSignal ?? fetchKalshiSignal;
	const polymarket = deps.fetchPolymarketSignal ?? fetchPolymarketSignal;
	const now = deps.now ?? new Date();
	const spotPrices = deps.spotPrices ?? {};

	const {
		kalshiBaseUrl,
		polymarketGammaBaseUrl,
		polymarketClobBaseUrl,
		targetHorizonHours,
		scoring,
	} = config.predictionMarkets;

	const signals: PredictionSignal[] = [];

	for (const asset of assets) {
		const mapping = getPredictionMarketMapping(asset.symbol);
		if (!mapping) {
			continue;
		}

		const spotPriceUsd = spotPrices[asset.symbol];
		if (spotPriceUsd === undefined) {
			continue;
		}

		if (mapping.kalshiSeriesTicker) {
			const seriesTicker = mapping.kalshiSeriesTicker;
			const signal = await safeFetch(() =>
				kalshi(
					{ baseUrl: kalshiBaseUrl },
					{
						asset: asset.symbol,
						seriesTicker,
						targetHorizonHours,
						now,
						spotPriceUsd,
						scoring,
					},
				),
			);
			if (signal) {
				signals.push(signal);
			}
		}

		if (mapping.polymarketEvent) {
			const event = mapping.polymarketEvent;
			const signal = await safeFetch(() =>
				polymarket(
					{
						gammaBaseUrl: polymarketGammaBaseUrl,
						clobBaseUrl: polymarketClobBaseUrl,
					},
					{
						asset: asset.symbol,
						event,
						targetHorizonHours,
						now,
						spotPriceUsd,
						scoring,
					},
				),
			);
			if (signal) {
				signals.push(signal);
			}
		}
	}

	return signals;
}
