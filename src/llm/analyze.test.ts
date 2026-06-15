import { describe, expect, it, vi } from "vitest";
import { formatMarketData } from "@/analysis/formatMarketData.js";
import type { AnalysisContext } from "@/analysis/types.js";
import {
	DEFAULT_LLM_CONTEXT_TOKENS,
	DEFAULT_LLM_MAX_OUTPUT_TOKENS,
	DEFAULT_LLM_TEMPERATURE,
} from "@/config/envSchema.js";
import { loadConfig } from "@/config/loadConfig.js";
import {
	createSampleMarketSnapshots,
	getAnalyzableAssets,
	runAnalysis,
} from "@/llm/index.js";
import { ParseResponseError } from "@/llm/parseResponse.js";

const validRecommendation = JSON.stringify({
	outlooks: [
		{
			asset: "BTC",
			direction_score: 8,
			confidence: 0.74,
			reason: "BTC shows the strongest near-term structure.",
		},
		{
			asset: "ETH",
			direction_score: 5,
			confidence: 0.6,
			reason: "ETH likely stays range-bound.",
		},
		{
			asset: "SOL",
			direction_score: 4,
			confidence: 0.55,
			reason: "SOL momentum is fading.",
		},
	],
	summary: "BTC is the strongest 24h candidate.",
});

function chatCompletionResponse(content: string): Response {
	return new Response(
		JSON.stringify({
			choices: [
				{
					message: {
						role: "assistant",
						content,
					},
				},
			],
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		},
	);
}

function createAnalysisContext(config: ReturnType<typeof loadConfig>) {
	const analyzableAssets = getAnalyzableAssets(config);
	const marketData = createSampleMarketSnapshots(analyzableAssets);

	return {
		context: {
			fetchedAt: new Date().toISOString(),
			sections: [
				{
					sourceId: "market",
					label: "Market data",
					payload: marketData,
					promptText: formatMarketData(marketData),
				},
			],
		} satisfies AnalysisContext,
		analyzableAssets,
	};
}

describe("runAnalysis", () => {
	it("calls the LLM provider and returns a validated recommendation", async () => {
		const config = loadConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const { context } = createAnalysisContext(config);

		const fetchImpl = vi
			.fn()
			.mockResolvedValue(chatCompletionResponse(validRecommendation));

		const recommendation = await runAnalysis(config, context, {
			fetchImpl,
		});

		expect(recommendation.outlooks).toHaveLength(3);
		expect(fetchImpl).toHaveBeenCalledOnce();

		const [url, request] = fetchImpl.mock.calls[0] as [URL, RequestInit];
		expect(url.href).toBe("http://127.0.0.1:11434/v1/chat/completions");

		const body = JSON.parse(request.body as string) as {
			model: string;
			stream: boolean;
			temperature: number;
			max_tokens: number;
			options: { num_ctx: number };
			response_format: { type: string };
			messages: Array<{ role: string; content: string }>;
		};
		expect(body.model).toBe("qwen3:8b");
		expect(body.temperature).toBe(DEFAULT_LLM_TEMPERATURE);
		expect(body.max_tokens).toBe(DEFAULT_LLM_MAX_OUTPUT_TOKENS);
		expect(body.options.num_ctx).toBe(DEFAULT_LLM_CONTEXT_TOKENS);
		expect(body.response_format).toEqual({ type: "json_object" });
		expect(body.stream).toBe(false);
		expect(body.messages[0]?.role).toBe("system");
		expect(body.messages[1]?.role).toBe("user");
	});

	it("retries once with a repair prompt when the initial response is invalid JSON", async () => {
		const config = loadConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const { context } = createAnalysisContext(config);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(chatCompletionResponse("not-json"))
			.mockResolvedValueOnce(chatCompletionResponse(validRecommendation));

		const recommendation = await runAnalysis(config, context, {
			fetchImpl,
		});

		expect(recommendation.outlooks).toHaveLength(3);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(infoSpy).toHaveBeenCalledWith(
			"Retrying LLM analysis with a JSON repair prompt...",
		);
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringMatching(/LLM initial response parse failed/i),
		);
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringMatching(/LLM initial raw output:\nnot-json/i),
		);

		const [, retryRequest] = fetchImpl.mock.calls[1] as [URL, RequestInit];
		const retryBody = JSON.parse(retryRequest.body as string) as {
			messages: Array<{ role: string; content: string }>;
		};
		expect(retryBody.messages[1]?.content).toContain(
			"Your previous response could not be parsed as valid JSON.",
		);
		expect(retryBody.messages[1]?.content).toContain("Invalid response:");
		expect(retryBody.messages[1]?.content).toContain("not-json");

		errorSpy.mockRestore();
		infoSpy.mockRestore();
	});

	it("logs the retry raw output and rethrows when both attempts fail", async () => {
		const config = loadConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const { context } = createAnalysisContext(config);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "info").mockImplementation(() => {});

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(chatCompletionResponse("still-not-json"))
			.mockResolvedValueOnce(chatCompletionResponse("also-not-json"));

		await expect(
			runAnalysis(config, context, {
				fetchImpl,
			}),
		).rejects.toThrow(ParseResponseError);

		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringMatching(/LLM retry raw output:\nalso-not-json/i),
		);

		errorSpy.mockRestore();
	});
});
