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

const validRelevanceBatch = JSON.stringify({
	relevant_post_indices: [0],
});

const validSynthesis = JSON.stringify({
	total_retrieved: 1,
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

function mockFilterThenSynthesize(
	relevanceContent: string,
	synthesisContent: string,
) {
	return vi
		.fn()
		.mockResolvedValueOnce(chatCompletionResponse(relevanceContent))
		.mockResolvedValueOnce(chatCompletionResponse(synthesisContent));
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

	it("runs relevance filter then synthesis and returns a validated analysis", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const fetchImpl = mockFilterThenSynthesize(
			validRelevanceBatch,
			validSynthesis,
		);

		const result = await analyzeSocialMedia(config, [sampleSignal], {
			fetchImpl,
			outlookAssets: ["BTC", "ETH", "SOL"],
		});

		expect(result.analysis.relevant_count).toBe(1);
		expect(result.analysis.top_posts[0]?.id).toBe("twitter:111");
		expect(result.llm.attempt).toBe("initial");
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(infoSpy).toHaveBeenCalledWith(
			expect.stringMatching(/relevance filter — 1 batches/),
		);
		expect(infoSpy).toHaveBeenCalledWith(
			expect.stringMatching(
				/Social media analysis completed in \d+ms \(filter=\d+ms, synthesize=\d+ms, relevant=1\/1\)/,
			),
		);

		const [, filterRequest] = fetchImpl.mock.calls[0] as [URL, RequestInit];
		const filterBody = JSON.parse(filterRequest.body as string) as {
			messages: Array<{ role: string; content: string }>;
		};
		expect(filterBody.messages[0]?.content).toContain("relevant_post_indices");
		expect(filterBody.messages[1]?.content).toContain(
			"Return post_index values",
		);

		const [, synthesisRequest] = fetchImpl.mock.calls[1] as [URL, RequestInit];
		const synthesisBody = JSON.parse(synthesisRequest.body as string) as {
			messages: Array<{ role: string; content: string }>;
		};
		expect(synthesisBody.messages[1]?.content).toContain(
			"pre-filtered relevant posts",
		);
		expect(synthesisBody.messages[1]?.content).toContain("[index=0]");

		infoSpy.mockRestore();
	});

	it("skips synthesis when relevance filter finds no posts", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(
				chatCompletionResponse(JSON.stringify({ relevant_post_indices: [] })),
			);

		const result = await analyzeSocialMedia(config, [sampleSignal], {
			fetchImpl,
			outlookAssets: ["BTC"],
		});

		expect(result.analysis.total_retrieved).toBe(1);
		expect(result.analysis.relevant_count).toBe(0);
		expect(result.analysis.top_posts).toEqual([]);
		expect(result.llm.attempt).toBe("skipped");
		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(infoSpy).toHaveBeenCalledWith(
			expect.stringMatching(
				/Social media analysis completed in \d+ms \(filter=\d+ms, synthesize=0ms, relevant=0\/1\)/,
			),
		);

		infoSpy.mockRestore();
	});

	it("injects macro briefing market context into both filter and synthesis prompts", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const fetchImpl = mockFilterThenSynthesize(
			validRelevanceBatch,
			validSynthesis,
		);
		const generatedAt = new Date("2026-06-16T07:00:00.000Z");

		await analyzeSocialMedia(config, [sampleSignal], {
			fetchImpl,
			outlookAssets: ["BTC"],
			marketContext: {
				content: "Risk-off ahead of CPI.",
				generatedAt,
			},
		});

		for (const call of fetchImpl.mock.calls) {
			const [, request] = call as [URL, RequestInit];
			const body = JSON.parse(request.body as string) as {
				messages: Array<{ role: string; content: string }>;
			};
			expect(body.messages[1]?.content).toContain("Risk-off ahead of CPI.");
			expect(body.messages[1]?.content).toContain(
				"Market context (desk briefing generated 2026-06-16T07:00:00.000Z;):",
			);
		}

		infoSpy.mockRestore();
	});

	it("retries synthesis with a repair prompt when the initial response is invalid JSON", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(chatCompletionResponse(validRelevanceBatch))
			.mockResolvedValueOnce(chatCompletionResponse("not-json"))
			.mockResolvedValueOnce(chatCompletionResponse(validSynthesis));

		const result = await analyzeSocialMedia(config, [sampleSignal], {
			fetchImpl,
			outlookAssets: ["BTC"],
		});

		expect(result.analysis.relevant_count).toBe(1);
		expect(result.llm.attempt).toBe("retry");
		expect(fetchImpl).toHaveBeenCalledTimes(3);
		expect(infoSpy).toHaveBeenCalledWith(
			"Retrying social media synthesis with a JSON repair prompt...",
		);
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringMatching(
				/Social media synthesis initial response parse failed/i,
			),
		);

		const [, synthesisRetryRequest] = fetchImpl.mock.calls[2] as [
			URL,
			RequestInit,
		];
		const synthesisRetryBody = JSON.parse(
			synthesisRetryRequest.body as string,
		) as {
			messages: Array<{ role: string; content: string }>;
		};
		expect(synthesisRetryBody.messages[1]?.content).toContain(
			"Your previous response could not be parsed as valid JSON.",
		);

		errorSpy.mockRestore();
		infoSpy.mockRestore();
	});

	it("retries once when the synthesis LLM returns an empty response", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(chatCompletionResponse(validRelevanceBatch))
			.mockResolvedValueOnce(chatCompletionResponse(""))
			.mockResolvedValueOnce(chatCompletionResponse(validSynthesis));

		const result = await analyzeSocialMedia(config, [sampleSignal], {
			fetchImpl,
			outlookAssets: ["BTC"],
		});

		expect(result.analysis.relevant_count).toBe(1);
		expect(result.llm.attempt).toBe("retry");
		expect(fetchImpl).toHaveBeenCalledTimes(3);
		expect(infoSpy).toHaveBeenCalledWith(
			"Social media synthesis: LLM returned an empty response; retrying once...",
		);

		infoSpy.mockRestore();
	});

	it("rethrows when synthesis empty-response retries are exhausted", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		vi.spyOn(console, "info").mockImplementation(() => {});

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(chatCompletionResponse(validRelevanceBatch))
			.mockResolvedValueOnce(chatCompletionResponse(""))
			.mockResolvedValueOnce(chatCompletionResponse(""));

		await expect(
			analyzeSocialMedia(config, [sampleSignal], {
				fetchImpl,
				outlookAssets: ["BTC"],
			}),
		).rejects.toThrow(LlmError);

		expect(fetchImpl).toHaveBeenCalledTimes(3);
	});

	it("rethrows when both synthesis parse attempts fail", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "info").mockImplementation(() => {});

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(chatCompletionResponse(validRelevanceBatch))
			.mockResolvedValueOnce(chatCompletionResponse("still-not-json"))
			.mockResolvedValueOnce(chatCompletionResponse("also-not-json"));

		await expect(
			analyzeSocialMedia(config, [sampleSignal], {
				fetchImpl,
				outlookAssets: ["BTC"],
			}),
		).rejects.toThrow(ParseResponseError);

		expect(fetchImpl).toHaveBeenCalledTimes(3);
	});
});
