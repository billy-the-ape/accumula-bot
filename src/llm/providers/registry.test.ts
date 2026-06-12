import { describe, expect, it, vi } from "vitest";
import {
	completeJsonChatViaProvider,
	getLlmProvider,
} from "@/llm/providers/registry.js";

describe("getLlmProvider", () => {
	it("returns the configured provider adapter", () => {
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
				apiKey: "anthropic-key",
				fetchImpl,
			},
			"prompt",
		);

		expect(response).toBe('{"ok":true}');
	});
});
