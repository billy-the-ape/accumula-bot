export {
	type CoinGeckoClientOptions,
	fetchCoinMarkets,
	fetchCoinVolumeTrend,
	MarketDataError,
} from "@/market/coingeckoClient.js";
export {
	type FetchMarketSnapshotsOptions,
	fetchMarketSnapshots,
} from "@/market/fetchMarketSnapshots.js";
export { deriveVolumeTrend } from "@/market/volumeTrend.js";
