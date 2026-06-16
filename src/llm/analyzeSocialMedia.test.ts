import { describe, expect, it, vi } from "vitest";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import { analyzeSocialMedia } from "@/llm/analyzeSocialMedia.js";
import { ParseResponseError } from "@/llm/parseResponse.js";
import { LlmError } from "@/llm/providers/types.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";

const sampleSignal: SocialMediaSignal = {
	index: 0,
	id: "111",
	source: "twitter",
	username: "whale_alert",
	text: "Large BTC transfer detected",
	asOf: "2026-06-16T12:00:00.000Z",
	impressions: 42_000,
};

const validAnalysis = JSON.stringify({
	total_retrieved: 1,
	relevant_count: 1,
	summary: "One actionable whale alert.",
	themes: ["whale flow"],
	by_asset: [
		{
			asset: "BTC",
			sentiment: "bearish",
			note: "Exchange inflow increases sell-pressure risk.",
		},
	],
	top_posts: [
		{
			post_index: 0,
			rank: 1,
			relevance: "high",
			assets: ["BTC"],
			signal_type: "whale_alert",
			why: "Direct near-term supply signal.",
		},
	],
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

describe("analyzeSocialMedia", () => {
	it("skips the LLM when no posts were retrieved", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const fetchImpl = vi.fn();

		const result = await analyzeSocialMedia(config, [], { fetchImpl });

		expect(result.analysis.total_retrieved).toBe(0);
		expect(result.analysis.relevant_count).toBe(0);
		expect(result.llm.attempt).toBe("skipped");
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(infoSpy).toHaveBeenCalledWith(
			expect.stringMatching(/Social media analysis skipped \(0 posts\)/),
		);

		infoSpy.mockRestore();
	});

	it("calls the LLM provider and returns a validated analysis", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(chatCompletionResponse(validAnalysis));

		const result = await analyzeSocialMedia(config, [sampleSignal], {
			fetchImpl,
			outlookAssets: ["BTC", "ETH", "SOL"],
		});

		expect(result.analysis.relevant_count).toBe(1);
		expect(result.analysis.top_posts[0]?.id).toBe("twitter:111");
		expect(result.llm.attempt).toBe("initial");
		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(infoSpy).toHaveBeenCalledWith(
			expect.stringMatching(
				/Social media analysis completed in \d+ms \(attempt=initial, relevant=1\/1\)/,
			),
		);

		const [, request] = fetchImpl.mock.calls[0] as [URL, RequestInit];
		const body = JSON.parse(request.body as string) as {
			messages: Array<{ role: string; content: string }>;
		};
		expect(body.messages[0]?.role).toBe("system");
		expect(body.messages[1]?.content).toContain("[index=0]");

		infoSpy.mockRestore();
	});

	it("retries once with a repair prompt when the initial response is invalid JSON", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(chatCompletionResponse("not-json"))
			.mockResolvedValueOnce(chatCompletionResponse(validAnalysis));

		const result = await analyzeSocialMedia(config, [sampleSignal], {
			fetchImpl,
			outlookAssets: ["BTC"],
		});

		expect(result.analysis.relevant_count).toBe(1);
		expect(result.llm.attempt).toBe("retry");
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(infoSpy).toHaveBeenCalledWith(
			"Retrying social media analysis with a JSON repair prompt...",
		);
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringMatching(/Social media initial response parse failed/i),
		);

		const [, retryRequest] = fetchImpl.mock.calls[1] as [URL, RequestInit];
		const retryBody = JSON.parse(retryRequest.body as string) as {
			messages: Array<{ role: string; content: string }>;
		};
		expect(retryBody.messages[1]?.content).toContain(
			"Your previous response could not be parsed as valid JSON.",
		);

		errorSpy.mockRestore();
		infoSpy.mockRestore();
	});

	it("retries once when the LLM returns an empty response", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(chatCompletionResponse(""))
			.mockResolvedValueOnce(chatCompletionResponse(validAnalysis));

		const result = await analyzeSocialMedia(config, [sampleSignal], {
			fetchImpl,
			outlookAssets: ["BTC"],
		});

		expect(result.analysis.relevant_count).toBe(1);
		expect(result.llm.attempt).toBe("retry");
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(infoSpy).toHaveBeenCalledWith(
			"Social media: LLM returned an empty response; retrying once...",
		);

		infoSpy.mockRestore();
	});

	it("rethrows when empty-response retries are exhausted", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		vi.spyOn(console, "info").mockImplementation(() => {});

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(chatCompletionResponse(""))
			.mockResolvedValueOnce(chatCompletionResponse(""));

		await expect(
			analyzeSocialMedia(config, [sampleSignal], {
				fetchImpl,
				outlookAssets: ["BTC"],
			}),
		).rejects.toThrow(LlmError);

		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("rethrows when both parse attempts fail", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "info").mockImplementation(() => {});

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(chatCompletionResponse("still-not-json"))
			.mockResolvedValueOnce(chatCompletionResponse("also-not-json"));

		await expect(
			analyzeSocialMedia(config, [sampleSignal], {
				fetchImpl,
				outlookAssets: ["BTC"],
			}),
		).rejects.toThrow(ParseResponseError);

		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});
});
