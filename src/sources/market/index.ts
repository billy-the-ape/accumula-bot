export {
	type CoinGeckoClientOptions,
	fetchCoinMarkets,
	fetchCoinVolumeTrend,
	MarketDataError,
} from "@/sources/market/coingeckoClient.js";
export {
	type FetchMarketSnapshotsOptions,
	fetchMarketSnapshots,
} from "@/sources/market/fetchMarketSnapshots.js";
export { deriveVolumeTrend } from "@/sources/market/volumeTrend.js";
