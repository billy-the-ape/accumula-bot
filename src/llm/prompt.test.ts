import { describe, expect, it } from "vitest";
import { loadConfig } from "@/config/loadConfig.js";
import { createSampleMarketSnapshots } from "@/llm/marketSnapshot.js";
import { buildAnalysisPrompt, getAnalyzableAssets } from "@/llm/prompt.js";

describe("buildAnalysisPrompt", () => {
	it("includes ranking assets, defensive cash guidance, and market data", () => {
		const config = loadConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const analyzableAssets = getAnalyzableAssets(config);
		const marketData = createSampleMarketSnapshots(analyzableAssets);
		const prompt = buildAnalysisPrompt(config, marketData);

		expect(prompt).toContain("Maximize BTC-denominated returns");
		expect(prompt).toContain(
			"Rankings must use these volatile assets only: BTC, ETH, SOL",
		);
		expect(prompt).toContain(
			"or to USDC for defensive cash when preserving capital outweighs rotation",
		);
		expect(prompt).toContain(
			'Use the field name "score" only — never probability_of_outperforming_btc or similar.',
		);
		expect(prompt).toContain("change_30d_pct: 12");
		expect(prompt).not.toContain(
			"Rankings must use these volatile assets only: USDC",
		);
	});

	it("excludes stablecoins from analyzable assets", () => {
		const config = loadConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});

		expect(getAnalyzableAssets(config).map((asset) => asset.symbol)).toEqual([
			"BTC",
			"ETH",
			"SOL",
		]);
	});
});
