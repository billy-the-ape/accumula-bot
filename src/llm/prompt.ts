import type { AppConfig } from "@/config/index.js";
import type { AssetMarketSnapshot } from "@/llm/marketSnapshot.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";

export function getAnalyzableAssets(config: AppConfig): Cryptocurrency[] {
	const assets = config.assetTradeable.filter((asset) => !asset.isStable);
	if (assets.length === 0) {
		throw new Error("No non-stable assets configured for analysis");
	}

	return assets;
}

function formatMarketData(snapshots: AssetMarketSnapshot[]): string {
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

export function buildAnalysisPrompt(
	config: AppConfig,
	marketData: AssetMarketSnapshot[],
): string {
	const assets = marketData.map((snapshot) => snapshot.asset).join(", ");

	return [
		"You are a crypto portfolio analyst.",
		"",
		"Objective:",
		`Maximize ${config.assetToAccumulate.symbol}-denominated returns.`,
		"",
		`Rank the following assets by their probability of outperforming ${config.assetToAccumulate.symbol} over the next 30 days.`,
		"",
		"Return valid JSON only with this shape:",
		"{",
		'  "rankings": [{ "asset": "SYMBOL", "score": 0.0 }],',
		'  "recommended_asset": "SYMBOL",',
		'  "confidence": 0.0,',
		'  "reason": "short explanation"',
		"}",
		"",
		`Allowed assets: ${assets}`,
		"",
		"Market data:",
		formatMarketData(marketData),
	].join("\n");
}
