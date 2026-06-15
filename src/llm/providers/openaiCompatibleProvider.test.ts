import { describe, expect, it, vi } from "vitest";
import {
	DEFAULT_LLM_CONTEXT_TOKENS,
	DEFAULT_LLM_MAX_OUTPUT_TOKENS,
	DEFAULT_LLM_TEMPERATURE,
} from "@/config/envSchema.js";
import {
	openAiCompatibleProvider,
	resolveChatCompletionsUrl,
} from "@/llm/providers/openaiCompatibleProvider.js";
import { LlmError } from "@/llm/providers/types.js";
import { DEFAULT_LLM_REQUEST_TIMEOUT_MS } from "@/llm/requestTimeout.js";

function chatCompletionResponse(content: string): string {
	return JSON.stringify({
		choices: [{ message: { role: "assistant", content } }],
	});
}

describe("resolveChatCompletionsUrl", () => {
	it("appends /v1/chat/completions to a host-only base URL", () => {
		expect(resolveChatCompletionsUrl("http://127.0.0.1:11434").href).toBe(
			"http://127.0.0.1:11434/v1/chat/completions",
		);
	});

	it("appends /chat/completions when base URL already ends with /v1", () => {
		expect(resolveChatCompletionsUrl("https://api.openai.com/v1").href).toBe(
			"https://api.openai.com/v1/chat/completions",
		);
	});
});

describe("openAiCompatibleProvider", () => {
	const samplePrompt = {
		system: "Return valid JSON only.",
		user: "Analyze BTC.",
	};

	it("returns assistant content from an OpenAI-compatible response", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			new Response(chatCompletionResponse('{"ok":true}'), {
				status: 200,
			}),
		);

		const response = await openAiCompatibleProvider.completeJsonChat(
			{
				baseUrl: "http://127.0.0.1:11434",
				model: "qwen3:8b",
				requestTimeoutMs: DEFAULT_LLM_REQUEST_TIMEOUT_MS,
				temperature: DEFAULT_LLM_TEMPERATURE,
				contextTokens: DEFAULT_LLM_CONTEXT_TOKENS,
				maxOutputTokens: DEFAULT_LLM_MAX_OUTPUT_TOKENS,
				fetchImpl,
			},
			samplePrompt,
		);

		expect(response).toBe('{"ok":true}');
	});

	it("sends an OpenAI-compatible chat completion request", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(
				new Response(chatCompletionResponse("{}"), { status: 200 }),
			);

		await openAiCompatibleProvider.completeJsonChat(
			{
				baseUrl: "https://api.openai.com/v1",
				model: "gpt-4o-mini",
				requestTimeoutMs: DEFAULT_LLM_REQUEST_TIMEOUT_MS,
				temperature: DEFAULT_LLM_TEMPERATURE,
				contextTokens: DEFAULT_LLM_CONTEXT_TOKENS,
				maxOutputTokens: DEFAULT_LLM_MAX_OUTPUT_TOKENS,
				apiKey: "test-key",
				fetchImpl,
			},
			samplePrompt,
		);

		const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
		expect(url.href).toBe("https://api.openai.com/v1/chat/completions");
		expect(init.headers).toMatchObject({
			Authorization: "Bearer test-key",
		});

		const body = JSON.parse(init.body as string) as {
			response_format: { type: string };
			temperature: number;
			max_tokens: number;
			options: { num_ctx: number };
			messages: Array<{ role: string; content: string }>;
		};
		expect(body.response_format).toEqual({ type: "json_object" });
		expect(body.temperature).toBe(DEFAULT_LLM_TEMPERATURE);
		expect(body.max_tokens).toBe(DEFAULT_LLM_MAX_OUTPUT_TOKENS);
		expect(body.options.num_ctx).toBe(DEFAULT_LLM_CONTEXT_TOKENS);
		expect(body.messages).toEqual([
			{ role: "system", content: samplePrompt.system },
			{ role: "user", content: samplePrompt.user },
		]);
	});

	it("throws when the provider responds with an HTTP error", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(new Response("model not found", { status: 404 }));

		await expect(
			openAiCompatibleProvider.completeJsonChat(
				{
					baseUrl: "http://127.0.0.1:11434",
					model: "missing-model",
					requestTimeoutMs: DEFAULT_LLM_REQUEST_TIMEOUT_MS,
					temperature: DEFAULT_LLM_TEMPERATURE,
					contextTokens: DEFAULT_LLM_CONTEXT_TOKENS,
					maxOutputTokens: DEFAULT_LLM_MAX_OUTPUT_TOKENS,
					fetchImpl,
				},
				samplePrompt,
			),
		).rejects.toThrow(LlmError);
	});
});
