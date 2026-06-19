import { describe, expect, it } from "vitest";
import {
	buildAnalysisContext,
	formatMarketData,
	getMarketSnapshotsFromContext,
} from "@/analysis/index.js";
import type { AnalysisDataSource, AnalysisSection } from "@/analysis/types.js";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import { createSampleMarketSnapshots } from "@/llm/marketSnapshot.js";
import { getAnalyzableAssets } from "@/llm/prompt.js";

describe("buildAnalysisContext", () => {
	it("aggregates enabled analysis data sources", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const assets = getAnalyzableAssets(config);
		const snapshots = createSampleMarketSnapshots(assets);
		const stubSource: AnalysisDataSource = {
			id: "market",
			isEnabled: () => true,
			fetch: async (): Promise<AnalysisSection> => ({
				sourceId: "market",
				label: "Market data",
				payload: snapshots,
				promptText: formatMarketData(snapshots),
			}),
		};

		const context = await buildAnalysisContext(config, assets, {
			sources: [stubSource],
			marketContextLoader: async () => undefined,
		});

		expect(context.sections).toHaveLength(1);
		expect(context.sections[0]?.sourceId).toBe("market");
		expect(getMarketSnapshotsFromContext(context)).toEqual(snapshots);
	});

	it("loads market context once and attaches it to the analysis context", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const assets = getAnalyzableAssets(config);
		const snapshots = createSampleMarketSnapshots(assets);
		const generatedAt = new Date("2026-06-16T07:00:00.000Z");
		const receivedMarketContext: Array<unknown> = [];
		const stubSource: AnalysisDataSource = {
			id: "market",
			isEnabled: () => true,
			fetch: async (_config, _assets, options) => {
				receivedMarketContext.push(options?.marketContext);
				return {
					sourceId: "market",
					label: "Market data",
					payload: snapshots,
					promptText: formatMarketData(snapshots),
				};
			},
		};

		const context = await buildAnalysisContext(config, assets, {
			sources: [stubSource],
			marketContextLoader: async () => ({
				content: "Risk-off ahead of CPI.",
				generatedAt,
			}),
		});

		expect(context.marketContext).toEqual({
			content: "Risk-off ahead of CPI.",
			generatedAt,
		});
		expect(receivedMarketContext).toEqual([
			{
				content: "Risk-off ahead of CPI.",
				generatedAt,
			},
		]);
	});
});
