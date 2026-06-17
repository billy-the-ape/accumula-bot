import { describe, expect, it, vi } from "vitest";
import type { LlmConfig } from "@/config/appConfigSchema.js";
import {
	DEFAULT_LLM_CONTEXT_TOKENS,
	DEFAULT_LLM_MAX_OUTPUT_TOKENS,
	DEFAULT_LLM_TEMPERATURE,
} from "@/config/envSchema.js";
import {
	createOpenAiWebSearchResponse,
	extractResponsesOutputText,
	resolveResponsesUrl,
} from "@/llm/providers/openAiResponsesClient.js";
import { LlmError } from "@/llm/providers/types.js";
import { DEFAULT_LLM_REQUEST_TIMEOUT_MS } from "@/llm/requestTimeout.js";

const openAiConfig: LlmConfig = {
	provider: "openai_compatible",
	baseUrl: "https://api.openai.com/v1",
	model: "gpt-5.5",
	fastModel: "gpt-5.5",
	requestTimeoutMs: DEFAULT_LLM_REQUEST_TIMEOUT_MS,
	temperature: DEFAULT_LLM_TEMPERATURE,
	contextTokens: DEFAULT_LLM_CONTEXT_TOKENS,
	maxOutputTokens: DEFAULT_LLM_MAX_OUTPUT_TOKENS,
	apiKey: "test-key",
};

describe("resolveResponsesUrl", () => {
	it("appends /responses to a /v1 base URL", () => {
		expect(resolveResponsesUrl("https://api.openai.com/v1").href).toBe(
			"https://api.openai.com/v1/responses",
		);
	});
});

describe("extractResponsesOutputText", () => {
	it("reads top-level output_text", () => {
		expect(
			extractResponsesOutputText({
				output_text: " Risk-off ahead of CPI. ",
			}),
		).toBe("Risk-off ahead of CPI.");
	});

	it("reads message output_text parts from output array", () => {
		expect(
			extractResponsesOutputText({
				output: [
					{ type: "web_search_call" },
					{
						type: "message",
						content: [{ type: "output_text", text: "Macro read." }],
					},
				],
			}),
		).toBe("Macro read.");
	});
});

describe("createOpenAiWebSearchResponse", () => {
	it("calls the Responses API with web_search and high reasoning", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					output_text: "Risk-off ahead of CPI.",
				}),
				{ status: 200 },
			),
		);

		const result = await createOpenAiWebSearchResponse(
			openAiConfig,
			{
				instructions: "Write a concise briefing.",
				input: "Summarize macro for crypto.",
				reasoningEffort: "high",
			},
			{ fetchImpl },
		);

		expect(result.text).toBe("Risk-off ahead of CPI.");

		const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
		expect(url.href).toBe("https://api.openai.com/v1/responses");
		expect(init.headers).toMatchObject({
			Authorization: "Bearer test-key",
		});

		const body = JSON.parse(init.body as string) as Record<string, unknown>;
		expect(body.model).toBe("gpt-5.5");
		expect(body.instructions).toBe("Write a concise briefing.");
		expect(body.input).toBe("Summarize macro for crypto.");
		expect(body.reasoning).toEqual({ effort: "high" });
		expect(body.tool_choice).toBe("required");
		expect(body.tools).toEqual([
			{ type: "web_search", search_context_size: "medium" },
		]);
	});

	it("throws when the Responses API returns empty output", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ output: [] }), { status: 200 }),
			);

		await expect(
			createOpenAiWebSearchResponse(
				openAiConfig,
				{
					instructions: "Write a concise briefing.",
					input: "Summarize macro for crypto.",
				},
				{ fetchImpl },
			),
		).rejects.toThrow(LlmError);
	});
});
