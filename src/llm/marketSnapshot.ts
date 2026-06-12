import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";
import type { MarketSnapshot, VolumeTrend } from "@/schemas/MarketSnapshot.js";

export type { MarketSnapshot, VolumeTrend };
export type AssetMarketSnapshot = MarketSnapshot;

const SAMPLE_MARKET_DATA: Record<string, Omit<MarketSnapshot, "asset">> = {
	BTC: {
		priceUsd: 98500,
		change24hPct: 1.2,
		change7dPct: 4.5,
		change30dPct: 12.0,
		volumeTrend: "rising",
		marketCapUsd: 1_940_000_000_000,
	},
	ETH: {
		priceUsd: 3400,
		change24hPct: 0.8,
		change7dPct: 2.1,
		change30dPct: 8.5,
		volumeTrend: "flat",
		marketCapUsd: 410_000_000_000,
	},
	SOL: {
		priceUsd: 185,
		change24hPct: 2.4,
		change7dPct: 6.8,
		change30dPct: 18.2,
		volumeTrend: "rising",
		marketCapUsd: 88_000_000_000,
	},
};

export function createSampleMarketSnapshots(
	assets: Cryptocurrency[],
): MarketSnapshot[] {
	return assets.map((asset) => {
		const sample = SAMPLE_MARKET_DATA[asset.symbol];
		if (!sample) {
			throw new Error(
				`No sample market data for ${asset.symbol}; add test fixture data or use fetchMarketSnapshots`,
			);
		}

		return {
			asset: asset.symbol,
			...sample,
		};
	});
}
