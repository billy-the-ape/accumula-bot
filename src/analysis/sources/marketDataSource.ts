import { formatMarketData } from "@/analysis/formatMarketData.js";
import type { AnalysisDataSource, AnalysisSection } from "@/analysis/types.js";
import type { AppConfig } from "@/config/index.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";
import { fetchMarketSnapshots } from "@/sources/market/fetchMarketSnapshots.js";

export const marketDataSource: AnalysisDataSource = {
	id: "market",

	isEnabled(): boolean {
		return true;
	},

	async fetch(
		config: AppConfig,
		assets: readonly Cryptocurrency[],
	): Promise<AnalysisSection> {
		const snapshots = await fetchMarketSnapshots([...assets], {
			baseUrl: config.coingecko.baseUrl,
			...(config.coingecko.apiKey ? { apiKey: config.coingecko.apiKey } : {}),
		});

		return {
			sourceId: "market",
			label: "Market data",
			payload: snapshots,
			promptText: formatMarketData(snapshots),
		};
	},
};
