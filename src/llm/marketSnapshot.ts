import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";

export type VolumeTrend = "rising" | "falling" | "flat";

export type AssetMarketSnapshot = {
	asset: string;
	priceUsd: number;
	change24hPct: number;
	change7dPct: number;
	change30dPct: number;
	volumeTrend: VolumeTrend;
	marketCapUsd: number;
};

const SAMPLE_MARKET_DATA: Record<string, Omit<AssetMarketSnapshot, "asset">> = {
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
): AssetMarketSnapshot[] {
	return assets.map((asset) => {
		const sample = SAMPLE_MARKET_DATA[asset.symbol];
		if (!sample) {
			throw new Error(
				`No sample market data for ${asset.symbol}; add Phase 1 placeholder data or market ingestion`,
			);
		}

		return {
			asset: asset.symbol,
			...sample,
		};
	});
}
