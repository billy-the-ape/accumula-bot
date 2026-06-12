import { describe, expect, it, vi } from "vitest";
import type { LlmConfig } from "@/config/appConfigSchema.js";
import { completeJsonChat } from "@/llm/llmClient.js";

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
		};

		const response = await completeJsonChat(config, "prompt", { fetchImpl });

		expect(response).toBe('{"ok":true}');
		expect(fetchImpl).toHaveBeenCalledOnce();
	});
});
