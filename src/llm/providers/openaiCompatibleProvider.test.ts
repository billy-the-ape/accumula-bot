import { describe, expect, it, vi } from "vitest";
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
				fetchImpl,
			},
			"prompt",
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
				apiKey: "test-key",
				fetchImpl,
			},
			"prompt",
		);

		const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
		expect(url.href).toBe("https://api.openai.com/v1/chat/completions");
		expect(init.headers).toMatchObject({
			Authorization: "Bearer test-key",
		});

		const body = JSON.parse(init.body as string) as {
			response_format: { type: string };
			messages: Array<{ role: string; content: string }>;
		};
		expect(body.response_format).toEqual({ type: "json_object" });
		expect(body.messages).toEqual([{ role: "user", content: "prompt" }]);
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
					fetchImpl,
				},
				"prompt",
			),
		).rejects.toThrow(LlmError);
	});
});
