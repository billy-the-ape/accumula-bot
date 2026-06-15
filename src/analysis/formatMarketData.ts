import type { MarketSnapshot } from "@/schemas/MarketSnapshot.js";

export function formatMarketData(snapshots: readonly MarketSnapshot[]): string {
	return snapshots
		.map((snapshot) =>
			[
				`${snapshot.asset}:`,
				`  price_usd: ${snapshot.priceUsd}`,
				`  change_24h_pct: ${snapshot.change24hPct}`,
				`  change_7d_pct: ${snapshot.change7dPct}`,
				`  change_30d_pct: ${snapshot.change30dPct}`,
				`  volume_trend: ${snapshot.volumeTrend}`,
				`  market_cap_usd: ${snapshot.marketCapUsd}`,
			].join("\n"),
		)
		.join("\n\n");
}
