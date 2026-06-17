import { describe, expect, it, vi } from "vitest";
import {
	DEFAULT_LLM_CONTEXT_TOKENS,
	DEFAULT_LLM_MAX_OUTPUT_TOKENS,
	DEFAULT_LLM_TEMPERATURE,
} from "@/config/envSchema.js";
import { ollamaProvider } from "@/llm/providers/ollamaProvider.js";
import { LlmError } from "@/llm/providers/types.js";
import { DEFAULT_LLM_REQUEST_TIMEOUT_MS } from "@/llm/requestTimeout.js";

function chatCompletionResponse(content: string): string {
	return JSON.stringify({
		choices: [{ message: { role: "assistant", content } }],
	});
}

describe("ollamaProvider", () => {
	const samplePrompt = {
		system: "Return valid JSON only.",
		user: "Analyze BTC.",
	};

	it("returns assistant content from an Ollama response", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			new Response(chatCompletionResponse('{"ok":true}'), {
				status: 200,
			}),
		);

		const response = await ollamaProvider.completeJsonChat(
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

	it("sends Ollama num_ctx options and JSON response_format by default", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(
				new Response(chatCompletionResponse("{}"), { status: 200 }),
			);

		await ollamaProvider.completeJsonChat(
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

		const body = JSON.parse(
			(fetchImpl.mock.calls[0] as [URL, RequestInit])[1].body as string,
		) as Record<string, unknown>;
		expect(body.options).toEqual({ num_ctx: DEFAULT_LLM_CONTEXT_TOKENS });
		expect(body.response_format).toEqual({ type: "json_object" });
	});

	it("omits JSON response_format when jsonMode is false", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(
				new Response(chatCompletionResponse("plain prose"), { status: 200 }),
			);

		await ollamaProvider.completeJsonChat(
			{
				baseUrl: "http://127.0.0.1:11434",
				model: "qwen3:8b",
				requestTimeoutMs: DEFAULT_LLM_REQUEST_TIMEOUT_MS,
				temperature: DEFAULT_LLM_TEMPERATURE,
				contextTokens: DEFAULT_LLM_CONTEXT_TOKENS,
				maxOutputTokens: DEFAULT_LLM_MAX_OUTPUT_TOKENS,
				jsonMode: false,
				fetchImpl,
			},
			samplePrompt,
		);

		const body = JSON.parse(
			(fetchImpl.mock.calls[0] as [URL, RequestInit])[1].body as string,
		) as Record<string, unknown>;
		expect(body.response_format).toBeUndefined();
		expect(body.options).toEqual({ num_ctx: DEFAULT_LLM_CONTEXT_TOKENS });
	});

	it("throws when the provider responds with an HTTP error", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(new Response("model not found", { status: 404 }));

		await expect(
			ollamaProvider.completeJsonChat(
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
