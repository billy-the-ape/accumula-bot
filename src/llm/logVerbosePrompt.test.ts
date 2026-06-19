import { describe, expect, it, vi } from "vitest";
import type { LlmConfig } from "@/config/appConfigSchema.js";
import {
	DEFAULT_LLM_CONTEXT_TOKENS,
	DEFAULT_LLM_MAX_OUTPUT_TOKENS,
	DEFAULT_LLM_TEMPERATURE,
} from "@/config/envSchema.js";
import { completeJsonChat } from "@/llm/llmClient.js";
import {
	logVerboseChatPrompt,
	logVerboseChatResponse,
	logVerboseResponsesPrompt,
} from "@/llm/logVerbosePrompt.js";
import { DEFAULT_LLM_REQUEST_TIMEOUT_MS } from "@/llm/requestTimeout.js";

describe("logVerbosePrompt", () => {
	it("logs system and user sections for chat prompts", () => {
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

		logVerboseChatPrompt("trade-recommendation", {
			system: "Return JSON.",
			user: "Analyze BTC.",
		});

		expect(infoSpy).toHaveBeenCalledWith(
			[
				"LLM prompt [trade-recommendation]",
				"--- system ---",
				"Return JSON.",
				"--- user ---",
				"Analyze BTC.",
			].join("\n"),
		);

		infoSpy.mockRestore();
	});

	it("logs instructions and input for responses prompts", () => {
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

		logVerboseResponsesPrompt("macro-briefing", {
			instructions: "Write a briefing.",
			input: "Summarize macro.",
		});

		expect(infoSpy).toHaveBeenCalledWith(
			[
				"LLM prompt [macro-briefing]",
				"--- instructions ---",
				"Write a briefing.",
				"--- input ---",
				"Summarize macro.",
			].join("\n"),
		);

		infoSpy.mockRestore();
	});

	it("logs the full response body", () => {
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

		logVerboseChatResponse("social-media-analysis", '{"summary":"- fact"}');

		expect(infoSpy).toHaveBeenCalledWith(
			[
				"LLM response [social-media-analysis]",
				"--- response ---",
				'{"summary":"- fact"}',
			].join("\n"),
		);

		infoSpy.mockRestore();
	});
});

describe("completeJsonChat verbose logging", () => {
	it("logs the full prompt and response when verbosePromptLogs is enabled", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					choices: [{ message: { content: '{"ok":true}' } }],
				}),
				{ status: 200 },
			),
		);
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

		const config: LlmConfig = {
			provider: "ollama",
			baseUrl: "http://127.0.0.1:11434",
			model: "qwen3:8b",
			fastModel: "qwen3:8b",
			requestTimeoutMs: DEFAULT_LLM_REQUEST_TIMEOUT_MS,
			temperature: DEFAULT_LLM_TEMPERATURE,
			contextTokens: DEFAULT_LLM_CONTEXT_TOKENS,
			maxOutputTokens: DEFAULT_LLM_MAX_OUTPUT_TOKENS,
		};

		await completeJsonChat(
			config,
			{ system: "Return JSON.", user: "Analyze." },
			{
				fetchImpl,
				verbosePromptLogs: true,
				verbosePromptLabel: "trade-recommendation",
			},
		);

		expect(infoSpy).toHaveBeenCalledWith(
			[
				"LLM prompt [trade-recommendation]",
				"--- system ---",
				"Return JSON.",
				"--- user ---",
				"Analyze.",
			].join("\n"),
		);
		expect(infoSpy).toHaveBeenCalledWith(
			[
				"LLM response [trade-recommendation]",
				"--- response ---",
				'{"ok":true}',
			].join("\n"),
		);

		infoSpy.mockRestore();
	});
});
