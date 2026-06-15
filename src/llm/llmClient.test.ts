import { describe, expect, it, vi } from "vitest";
import type { LlmConfig } from "@/config/appConfigSchema.js";
import { DEFAULT_LLM_TEMPERATURE } from "@/config/envSchema.js";
import { completeJsonChat } from "@/llm/llmClient.js";
import { DEFAULT_LLM_REQUEST_TIMEOUT_MS } from "@/llm/requestTimeout.js";

describe("completeJsonChat", () => {
	it("delegates to the configured provider adapter", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					choices: [{ message: { content: '{"ok":true}' } }],
				}),
				{ status: 200 },
			),
		);

		const config: LlmConfig = {
			provider: "openai_compatible",
			baseUrl: "http://127.0.0.1:11434",
			model: "qwen3:8b",
			requestTimeoutMs: DEFAULT_LLM_REQUEST_TIMEOUT_MS,
			temperature: DEFAULT_LLM_TEMPERATURE,
		};

		const response = await completeJsonChat(
			config,
			{ system: "Return JSON.", user: "Analyze." },
			{ fetchImpl },
		);

		expect(response).toBe('{"ok":true}');
		expect(fetchImpl).toHaveBeenCalledOnce();
	});
});
