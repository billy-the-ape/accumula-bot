import { describe, expect, it } from "vitest";
import { formatMarketData } from "@/analysis/formatMarketData.js";
import type { AnalysisContext } from "@/analysis/types.js";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import { createSampleMarketSnapshots } from "@/llm/marketSnapshot.js";
import { buildAnalysisPromptParts, getAnalyzableAssets } from "@/llm/prompt.js";

describe("buildAnalysisPromptParts", () => {
	it("puts JSON contract rules in the system prompt", () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
			CLOUDAMQP_URL: "amqp://localhost",
		});
		const analyzableAssets = getAnalyzableAssets(config);
		const outlookAssets = analyzableAssets.map((asset) => asset.symbol);
		const marketData = createSampleMarketSnapshots(analyzableAssets);
		const context: AnalysisContext = {
			fetchedAt: new Date().toISOString(),
			sections: [
				{
					sourceId: "market",
					label: "Market data",
					payload: marketData,
					promptText: formatMarketData(marketData),
				},
			],
		};
		const prompt = buildAnalysisPromptParts(config, context, outlookAssets);

		expect(prompt.system).toContain("parseable by JSON.parse()");
		expect(prompt.system).toContain('The first character must be "{"');
		expect(prompt.system).toContain("Do not wrap the JSON in markdown fences");
		expect(prompt.system).toContain(
			"Required assets (include each exactly once): BTC, ETH, SOL",
		);
		expect(prompt.system).toContain('"asset": "BTC"');
		expect(prompt.user).toContain("Maximize BTC-denominated returns");
		expect(prompt.user).toContain("Outlook assets: BTC, ETH, SOL");
		expect(prompt.user).toContain("change_30d_pct: 12");
		expect(prompt.user).not.toContain("Outlook assets: USDC");
	});

	it("includes macro briefing market context before analysis inputs when present", () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
			CLOUDAMQP_URL: "amqp://localhost",
		});
		const analyzableAssets = getAnalyzableAssets(config);
		const outlookAssets = analyzableAssets.map((asset) => asset.symbol);
		const marketData = createSampleMarketSnapshots(analyzableAssets);
		const generatedAt = new Date("2026-06-16T07:00:00.000Z");
		const context: AnalysisContext = {
			fetchedAt: new Date().toISOString(),
			marketContext: {
				content: "Risk-off ahead of CPI.",
				generatedAt,
			},
			sections: [
				{
					sourceId: "market",
					label: "Market data",
					payload: marketData,
					promptText: formatMarketData(marketData),
				},
			],
		};
		const prompt = buildAnalysisPromptParts(config, context, outlookAssets);

		expect(prompt.user).toContain("Market context (desk briefing generated");
		expect(prompt.user).toContain("Risk-off ahead of CPI.");
		expect(
			prompt.user.indexOf("Market context (desk briefing generated"),
		).toBeLessThan(prompt.user.indexOf("--- Start of analysis inputs ---"));
		expect(
			prompt.user.indexOf("--- Start of analysis inputs ---"),
		).toBeLessThan(prompt.user.indexOf("change_30d_pct: 12"));
	});

	it("excludes stablecoins from analyzable assets", () => {
		const config = loadTestConfig({
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
