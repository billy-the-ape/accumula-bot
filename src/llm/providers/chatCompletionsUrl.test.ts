import { describe, expect, it } from "vitest";
import {
	applyMaxOutputTokens,
	isOpenAiOfficialApi,
	resolveChatCompletionsUrl,
} from "@/llm/providers/chatCompletionsUrl.js";

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

describe("isOpenAiOfficialApi", () => {
	it("detects OpenAI's hosted API", () => {
		expect(isOpenAiOfficialApi("https://api.openai.com/v1")).toBe(true);
		expect(isOpenAiOfficialApi("http://127.0.0.1:11434")).toBe(false);
	});
});

describe("applyMaxOutputTokens", () => {
	it("uses max_completion_tokens for api.openai.com", () => {
		const body: Record<string, unknown> = {};
		applyMaxOutputTokens(body, "https://api.openai.com/v1", 512);
		expect(body.max_completion_tokens).toBe(512);
		expect(body.max_tokens).toBeUndefined();
	});

	it("uses max_tokens for other OpenAI-compatible hosts", () => {
		const body: Record<string, unknown> = {};
		applyMaxOutputTokens(body, "https://example.com/v1", 512);
		expect(body.max_tokens).toBe(512);
		expect(body.max_completion_tokens).toBeUndefined();
	});
});
