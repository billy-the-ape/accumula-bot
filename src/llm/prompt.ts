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
	const rankingAssets = marketData.map((snapshot) => snapshot.asset).join(", ");
	const cashSymbol = config.assetStarting.symbol;
	const accumulateSymbol = config.assetToAccumulate.symbol;

	return [
		"You are a crypto portfolio analyst.",
		"",
		"Objective:",
		`Maximize ${accumulateSymbol}-denominated returns.`,
		"",
		`Rank the following volatile assets by their probability of outperforming ${accumulateSymbol} over the next 30 days.`,
		"",
		"Return valid JSON only. Use EXACTLY these field names (no alternatives):",
		"{",
		'  "rankings": [{ "asset": "SYMBOL", "score": 0.0 }],',
		'  "recommended_asset": "SYMBOL",',
		'  "confidence": 0.0,',
		'  "reason": "short explanation"',
		"}",
		"",
		"Rules:",
		"- score and confidence must be JSON numbers between 0 and 1 (not strings).",
		'- Use the field name "score" only — never probability_of_outperforming_btc or similar.',
		'- Use the field name "reason" only — never "reasoning".',
		"- Include every volatile asset in rankings with one entry each.",
		"",
		`Rankings must use these volatile assets only: ${rankingAssets}`,
		`Set recommended_asset to a ranked volatile, to ${accumulateSymbol} when it is the strongest relative hold, or to ${cashSymbol} for defensive cash when preserving capital outweighs rotation.`,
		"",
		"Market data:",
		formatMarketData(marketData),
	].join("\n");
}
