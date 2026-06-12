import { describe, expect, it, vi } from "vitest";
import {
	anthropicProvider,
	resolveAnthropicMessagesUrl,
} from "@/llm/providers/anthropicProvider.js";

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
				apiKey: "anthropic-key",
				fetchImpl,
			},
			"prompt",
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
				apiKey: "anthropic-key",
				fetchImpl,
			},
			"prompt",
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
			messages: Array<{ role: string; content: string }>;
		};
		expect(body.model).toBe("claude-3-5-sonnet-20241022");
		expect(body.max_tokens).toBeGreaterThan(0);
		expect(body.messages).toEqual([{ role: "user", content: "prompt" }]);
	});

	it("requires an API key", async () => {
		await expect(
			anthropicProvider.completeJsonChat(
				{
					baseUrl: "https://api.anthropic.com",
					model: "claude-3-5-sonnet-20241022",
					fetchImpl: vi.fn(),
				},
				"prompt",
			),
		).rejects.toThrow(/requires LLM_API_KEY/i);
	});
});
