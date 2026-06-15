import { describe, expect, it } from "vitest";
import {
	buildAnalysisContext,
	formatMarketData,
	getMarketSnapshotsFromContext,
} from "@/analysis/index.js";
import type { AnalysisDataSource, AnalysisSection } from "@/analysis/types.js";
import { loadConfig } from "@/config/loadConfig.js";
import { createSampleMarketSnapshots } from "@/llm/marketSnapshot.js";
import { getAnalyzableAssets } from "@/llm/prompt.js";

describe("buildAnalysisContext", () => {
	it("aggregates enabled analysis data sources", async () => {
		const config = loadConfig({
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
		});

		expect(context.sections).toHaveLength(1);
		expect(context.sections[0]?.sourceId).toBe("market");
		expect(getMarketSnapshotsFromContext(context)).toEqual(snapshots);
	});
});
