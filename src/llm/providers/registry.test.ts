import { describe, expect, it, vi } from "vitest";
import {
	DEFAULT_LLM_CONTEXT_TOKENS,
	DEFAULT_LLM_MAX_OUTPUT_TOKENS,
	DEFAULT_LLM_TEMPERATURE,
} from "@/config/envSchema.js";
import {
	completeJsonChatViaProvider,
	getLlmProvider,
} from "@/llm/providers/registry.js";
import { DEFAULT_LLM_REQUEST_TIMEOUT_MS } from "@/llm/requestTimeout.js";

describe("getLlmProvider", () => {
	it("returns the configured provider adapter", () => {
		expect(getLlmProvider("ollama").id).toBe("ollama");
		expect(getLlmProvider("openai_compatible").id).toBe("openai_compatible");
		expect(getLlmProvider("anthropic").id).toBe("anthropic");
	});
});

describe("completeJsonChatViaProvider", () => {
	it("routes requests through the selected provider adapter", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					content: [{ type: "text", text: '{"ok":true}' }],
				}),
				{ status: 200 },
			),
		);

		const response = await completeJsonChatViaProvider(
			"anthropic",
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
			{
				system: "Return JSON.",
				user: "Analyze.",
			},
		);

		expect(response).toBe('{"ok":true}');
	});
});
