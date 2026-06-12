import { describe, expect, it } from "vitest";
import { loadConfig } from "@/config/loadConfig.js";
import { createSampleMarketSnapshots } from "@/llm/marketSnapshot.js";
import { buildAnalysisPrompt, getAnalyzableAssets } from "@/llm/prompt.js";

describe("buildAnalysisPrompt", () => {
	it("includes the base token objective and market data", () => {
		const config = loadConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const analyzableAssets = getAnalyzableAssets(config);
		const marketData = createSampleMarketSnapshots(analyzableAssets);
		const prompt = buildAnalysisPrompt(config, marketData);

		expect(prompt).toContain("Maximize BTC-denominated returns");
		expect(prompt).toContain("Allowed assets: BTC, ETH, SOL");
		expect(prompt).toContain("change_30d_pct: 12");
		expect(prompt).not.toContain("USDC");
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
