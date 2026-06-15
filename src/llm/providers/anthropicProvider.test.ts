import { describe, expect, it, vi } from "vitest";
import {
	DEFAULT_LLM_CONTEXT_TOKENS,
	DEFAULT_LLM_MAX_OUTPUT_TOKENS,
	DEFAULT_LLM_TEMPERATURE,
} from "@/config/envSchema.js";
import {
	anthropicProvider,
	resolveAnthropicMessagesUrl,
} from "@/llm/providers/anthropicProvider.js";
import { DEFAULT_LLM_REQUEST_TIMEOUT_MS } from "@/llm/requestTimeout.js";

function anthropicResponse(content: string): string {
	return JSON.stringify({
		content: [{ type: "text", text: content }],
	});
}

describe("resolveAnthropicMessagesUrl", () => {
	it("appends /v1/messages to a host-only base URL", () => {
		expect(resolveAnthropicMessagesUrl("https://api.anthropic.com").href).toBe(
			"https://api.anthropic.com/v1/messages",
		);
	});
});

describe("anthropicProvider", () => {
	const samplePrompt = {
		system: "Return valid JSON only.",
		user: "Analyze BTC.",
	};

	it("returns text content from an Anthropic messages response", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(
				new Response(anthropicResponse('{"ok":true}'), { status: 200 }),
			);

		const response = await anthropicProvider.completeJsonChat(
			{
				baseUrl: "https://api.anthropic.com",
				model: "claude-3-5-sonnet-20241022",
				requestTimeoutMs: DEFAULT_LLM_REQUEST_TIMEOUT_MS,
				temperature: DEFAULT_LLM_TEMPERATURE,
				contextTokens: DEFAULT_LLM_CONTEXT_TOKENS,
				maxOutputTokens: DEFAULT_LLM_MAX_OUTPUT_TOKENS,
				apiKey: "anthropic-key",
				fetchImpl,
			},
			samplePrompt,
		);

		expect(response).toBe('{"ok":true}');
	});

	it("sends an Anthropic messages request with required headers", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(
				new Response(anthropicResponse("{}"), { status: 200 }),
			);

		await anthropicProvider.completeJsonChat(
			{
				baseUrl: "https://api.anthropic.com",
				model: "claude-3-5-sonnet-20241022",
				requestTimeoutMs: DEFAULT_LLM_REQUEST_TIMEOUT_MS,
				temperature: DEFAULT_LLM_TEMPERATURE,
				contextTokens: DEFAULT_LLM_CONTEXT_TOKENS,
				maxOutputTokens: DEFAULT_LLM_MAX_OUTPUT_TOKENS,
				apiKey: "anthropic-key",
				fetchImpl,
			},
			samplePrompt,
		);

		const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
		expect(url.href).toBe("https://api.anthropic.com/v1/messages");
		expect(init.headers).toMatchObject({
			"x-api-key": "anthropic-key",
			"anthropic-version": "2023-06-01",
		});

		const body = JSON.parse(init.body as string) as {
			model: string;
			max_tokens: number;
			temperature: number;
			system: string;
			messages: Array<{ role: string; content: string }>;
		};
		expect(body.model).toBe("claude-3-5-sonnet-20241022");
		expect(body.max_tokens).toBe(DEFAULT_LLM_MAX_OUTPUT_TOKENS);
		expect(body.temperature).toBe(DEFAULT_LLM_TEMPERATURE);
		expect(body.system).toContain("Return valid JSON only.");
		expect(body.messages).toEqual([
			{ role: "user", content: samplePrompt.user },
		]);
	});

	it("requires an API key", async () => {
		await expect(
			anthropicProvider.completeJsonChat(
				{
					baseUrl: "https://api.anthropic.com",
					model: "claude-3-5-sonnet-20241022",
					requestTimeoutMs: DEFAULT_LLM_REQUEST_TIMEOUT_MS,
					temperature: DEFAULT_LLM_TEMPERATURE,
					contextTokens: DEFAULT_LLM_CONTEXT_TOKENS,
					maxOutputTokens: DEFAULT_LLM_MAX_OUTPUT_TOKENS,
					fetchImpl: vi.fn(),
				},
				samplePrompt,
			),
		).rejects.toThrow(/requires LLM_API_KEY/i);
	});
});
