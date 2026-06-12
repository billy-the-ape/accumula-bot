import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "@/config/loadConfig.js";
import {
	createSampleMarketSnapshots,
	getAnalyzableAssets,
	runAnalysis,
} from "@/llm/index.js";

const validRecommendation = JSON.stringify({
	rankings: [
		{ asset: "BTC", score: 0.82 },
		{ asset: "ETH", score: 0.71 },
		{ asset: "SOL", score: 0.77 },
	],
	recommended_asset: "BTC",
	confidence: 0.74,
	reason: "BTC shows the strongest relative structure.",
});

describe("runAnalysis", () => {
	it("calls the LLM provider and returns a validated recommendation", async () => {
		const config = loadConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const marketData = createSampleMarketSnapshots(getAnalyzableAssets(config));

		const fetchImpl = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								role: "assistant",
								content: validRecommendation,
							},
						},
					],
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			),
		);

		const recommendation = await runAnalysis(config, marketData, {
			fetchImpl,
		});

		expect(recommendation.recommended_asset).toBe("BTC");
		expect(fetchImpl).toHaveBeenCalledOnce();

		const [url, request] = fetchImpl.mock.calls[0] as [URL, RequestInit];
		expect(url.href).toBe("http://127.0.0.1:11434/v1/chat/completions");

		const body = JSON.parse(request.body as string) as {
			model: string;
			stream: boolean;
			response_format: { type: string };
		};
		expect(body.model).toBe("qwen3:8b");
		expect(body.response_format).toEqual({ type: "json_object" });
		expect(body.stream).toBe(false);
	});
});
