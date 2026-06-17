import { describe, expect, it, vi } from "vitest";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import {
	DEFAULT_SOCIAL_MEDIA_RELEVANCE_BATCH_SIZE,
	findRelevantSocialMediaSignals,
	splitSocialMediaSignalsIntoBatches,
} from "@/llm/findRelevantSocialMediaSignals.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";

function makeSignal(index: number): SocialMediaSignal {
	return {
		index,
		id: String(100 + index),
		source: "twitter",
		username: `user_${index}`,
		text: `Post text ${index}`,
		asOf: "2026-06-16T12:00:00.000Z",
		impressions: index * 100,
	};
}

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

describe("splitSocialMediaSignalsIntoBatches", () => {
	it("returns one batch when signals fit within batch size", () => {
		const signals = [makeSignal(0), makeSignal(1)];
		expect(splitSocialMediaSignalsIntoBatches(signals, 20)).toEqual([signals]);
	});

	it("splits signals into fixed-size batches", () => {
		const signals = Array.from({ length: 5 }, (_, index) => makeSignal(index));
		expect(splitSocialMediaSignalsIntoBatches(signals, 2)).toEqual([
			[makeSignal(0), makeSignal(1)],
			[makeSignal(2), makeSignal(3)],
			[makeSignal(4)],
		]);
	});
});

describe("findRelevantSocialMediaSignals", () => {
	it("returns no signals and skips the LLM when input is empty", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const fetchImpl = vi.fn();

		const result = await findRelevantSocialMediaSignals(config, [], {
			outlookAssets: ["BTC"],
			fetchImpl,
		});

		expect(result.relevantSignals).toEqual([]);
		expect(result.scannedCount).toBe(0);
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(infoSpy).toHaveBeenCalledWith(
			expect.stringMatching(/relevance filter skipped \(0 posts\)/),
		);

		infoSpy.mockRestore();
	});

	it("filters a single batch and returns matching signals", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const signals = [makeSignal(0), makeSignal(1), makeSignal(2)];
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(
				chatCompletionResponse(
					JSON.stringify({ relevant_post_indices: [0, 2] }),
				),
			);

		const result = await findRelevantSocialMediaSignals(config, signals, {
			outlookAssets: ["BTC"],
			fetchImpl,
			batchSize: 20,
		});

		expect(result.relevantSignals).toEqual([makeSignal(0), makeSignal(2)]);
		expect(result.scannedCount).toBe(3);
		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(infoSpy).toHaveBeenCalledWith(
			expect.stringMatching(
				/Social media relevance batch 1\/1 — 2 relevant of 3/,
			),
			expect.any(String),
		);
		expect(infoSpy).toHaveBeenCalledWith(
			expect.stringMatching(/relevance filter done — 2 relevant of 3 scanned/),
		);

		infoSpy.mockRestore();
	});

	it("runs sequential batch calls and unions relevant indices", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		vi.spyOn(console, "info").mockImplementation(() => {});
		const signals = Array.from({ length: 4 }, (_, index) => makeSignal(index));
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(
				chatCompletionResponse(JSON.stringify({ relevant_post_indices: [0] })),
			)
			.mockResolvedValueOnce(
				chatCompletionResponse(JSON.stringify({ relevant_post_indices: [3] })),
			);

		const result = await findRelevantSocialMediaSignals(config, signals, {
			outlookAssets: ["BTC"],
			fetchImpl,
			batchSize: 2,
		});

		expect(result.relevantSignals).toEqual([makeSignal(0), makeSignal(3)]);
		expect(result.scannedCount).toBe(4);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("retries with a repair prompt when the initial batch response is invalid JSON", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const signals = [makeSignal(0)];
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(chatCompletionResponse("not-json"))
			.mockResolvedValueOnce(
				chatCompletionResponse(JSON.stringify({ relevant_post_indices: [0] })),
			);

		const result = await findRelevantSocialMediaSignals(config, signals, {
			outlookAssets: ["BTC"],
			fetchImpl,
		});

		expect(result.relevantSignals).toEqual([makeSignal(0)]);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(infoSpy).toHaveBeenCalledWith(
			expect.stringMatching(/batch 1\/1: retrying with JSON repair prompt/),
		);
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringMatching(/batch 1\/1 initial response parse failed/i),
		);

		errorSpy.mockRestore();
		infoSpy.mockRestore();
	});

	it("degrades a failed batch to zero relevant without failing the whole run", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "info").mockImplementation(() => {});
		const signals = [makeSignal(0), makeSignal(1)];
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(
				chatCompletionResponse(JSON.stringify({ relevant_post_indices: [0] })),
			)
			.mockResolvedValueOnce(chatCompletionResponse("still-not-json"))
			.mockResolvedValueOnce(chatCompletionResponse("also-not-json"));

		const result = await findRelevantSocialMediaSignals(config, signals, {
			outlookAssets: ["BTC"],
			fetchImpl,
			batchSize: 1,
		});

		expect(result.relevantSignals).toEqual([makeSignal(0)]);
		expect(fetchImpl).toHaveBeenCalledTimes(3);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringMatching(
				/batch 2\/2: parse failed after retry; treating as 0 relevant/,
			),
		);

		errorSpy.mockRestore();
		warnSpy.mockRestore();
	});

	it("injects market context into each batch prompt", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		vi.spyOn(console, "info").mockImplementation(() => {});
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(
				chatCompletionResponse(JSON.stringify({ relevant_post_indices: [] })),
			);

		await findRelevantSocialMediaSignals(config, [makeSignal(0)], {
			outlookAssets: ["BTC"],
			fetchImpl,
			marketContext: {
				content: "Risk-off ahead of CPI.",
				generatedAt: new Date("2026-06-16T07:00:00.000Z"),
			},
		});

		const [, request] = fetchImpl.mock.calls[0] as [URL, RequestInit];
		const body = JSON.parse(request.body as string) as {
			messages: Array<{ role: string; content: string }>;
		};
		expect(body.messages[1]?.content).toContain("Risk-off ahead of CPI.");
	});

	it("uses the default batch size constant", () => {
		expect(DEFAULT_SOCIAL_MEDIA_RELEVANCE_BATCH_SIZE).toBe(20);
	});
});
