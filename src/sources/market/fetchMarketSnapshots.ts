import type { CoinGeckoMarket } from "@/schemas/CoinGeckoMarket.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";
import {
	type MarketSnapshot,
	MarketSnapshotSchema,
	type VolumeTrend,
} from "@/schemas/MarketSnapshot.js";
import {
	type CoinGeckoClientOptions,
	fetchCoinMarkets,
	fetchCoinVolumeTrend,
	MarketDataError,
} from "@/sources/market/coingeckoClient.js";

export type FetchMarketSnapshotsOptions = CoinGeckoClientOptions;

function normalizePercentage(value: number | null): number {
	return value ?? 0;
}

function buildSnapshot(
	asset: Cryptocurrency,
	market: CoinGeckoMarket,
	volumeTrend: VolumeTrend,
): MarketSnapshot {
	return MarketSnapshotSchema.parse({
		asset: asset.symbol,
		priceUsd: market.current_price,
		change24hPct: normalizePercentage(
			market.price_change_percentage_24h_in_currency,
		),
		change7dPct: normalizePercentage(
			market.price_change_percentage_7d_in_currency,
		),
		change30dPct: normalizePercentage(
			market.price_change_percentage_30d_in_currency,
		),
		volumeTrend,
		marketCapUsd: market.market_cap,
	});
}

export async function fetchMarketSnapshots(
	assets: Cryptocurrency[],
	options: FetchMarketSnapshotsOptions,
): Promise<MarketSnapshot[]> {
	const coingeckoIds = assets.map((asset) => asset.coingeckoId);
	const markets = await fetchCoinMarkets(options, coingeckoIds);
	const marketsById = new Map(markets.map((market) => [market.id, market]));

	const missingIds = coingeckoIds.filter((id) => !marketsById.has(id));
	if (missingIds.length > 0) {
		throw new MarketDataError(
			`CoinGecko returned no market data for: ${missingIds.join(", ")}`,
		);
	}

	const snapshots = await Promise.all(
		assets.map(async (asset) => {
			const market = marketsById.get(asset.coingeckoId);
			if (!market) {
				throw new MarketDataError(
					`Missing CoinGecko market data for ${asset.symbol}`,
				);
			}

			const volumeTrend = await fetchCoinVolumeTrend(
				options,
				asset.coingeckoId,
			);

			return buildSnapshot(asset, market, volumeTrend);
		}),
	);

	return snapshots;
}
