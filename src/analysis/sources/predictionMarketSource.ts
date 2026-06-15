import type { AnalysisDataSource, AnalysisSection } from "@/analysis/types.js";
import type { AppConfig } from "@/config/index.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";
import { fetchMarketSnapshots } from "@/sources/market/fetchMarketSnapshots.js";
import { collectPredictionSignals } from "@/sources/prediction_markets/collectPredictionSignals.js";
import { formatPredictionSignals } from "@/sources/prediction_markets/formatPredictionSignals.js";
import { getPredictionMarketMapping } from "@/sources/prediction_markets/marketMap.js";

/**
 * Fetch current spot prices for the mapped assets so the venues can pick the
 * at-the-money rung. Best-effort: returns {} on any failure (the venues then
 * fall back to nearest-horizon selection) and makes no network call when no
 * asset is mapped. Spot is used only for market selection — it is never fed to
 * the model, so it does not editorialize the context.
 */
async function fetchSpotPrices(
	config: AppConfig,
	assets: readonly Cryptocurrency[],
): Promise<Record<string, number>> {
	const mapped = assets.filter((asset) =>
		getPredictionMarketMapping(asset.symbol),
	);
	if (mapped.length === 0) {
		return {};
	}

	try {
		const snapshots = await fetchMarketSnapshots(mapped, {
			baseUrl: config.coingecko.baseUrl,
			...(config.coingecko.apiKey ? { apiKey: config.coingecko.apiKey } : {}),
		});
		return Object.fromEntries(
			snapshots.map((snapshot) => [snapshot.asset, snapshot.priceUsd]),
		);
	} catch {
		return {};
	}
}

export const predictionMarketSource: AnalysisDataSource = {
	id: "prediction_markets",

	isEnabled(config: AppConfig): boolean {
		return config.predictionMarkets.enabled;
	},

	async fetch(
		config: AppConfig,
		assets: readonly Cryptocurrency[],
	): Promise<AnalysisSection> {
		const spotPrices = await fetchSpotPrices(config, assets);
		const signals = await collectPredictionSignals(config, assets, {
			spotPrices,
		});

		return {
			sourceId: "prediction_markets",
			label: "Prediction markets",
			payload: signals,
			promptText: formatPredictionSignals(signals, assets),
		};
	},
};
