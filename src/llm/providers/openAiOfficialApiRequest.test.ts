import { describe, expect, it } from "vitest";
import {
	applyReasoningEffort,
	applyTemperature,
	isReasoningModel,
	supportsCustomTemperature,
} from "@/llm/providers/openAiOfficialApiRequest.js";

describe("isReasoningModel", () => {
	it("detects gpt-5 and o-series models", () => {
		expect(isReasoningModel("gpt-5.5")).toBe(true);
		expect(isReasoningModel("o3-mini")).toBe(true);
		expect(isReasoningModel("gpt-4o")).toBe(false);
	});
});

describe("applyReasoningEffort", () => {
	it("sets reasoning_effort for gpt-5.x on api.openai.com", () => {
		const body: Record<string, unknown> = {};
		applyReasoningEffort(body, "https://api.openai.com/v1", "gpt-5.5", "high");
		expect(body.reasoning_effort).toBe("high");
	});

	it("ignores reasoning_effort for non-reasoning models", () => {
		const body: Record<string, unknown> = {};
		applyReasoningEffort(body, "https://api.openai.com/v1", "gpt-4o", "high");
		expect(body.reasoning_effort).toBeUndefined();
	});
});

describe("supportsCustomTemperature", () => {
	it("returns false for gpt-5 and o-series models", () => {
		expect(supportsCustomTemperature("gpt-5.5")).toBe(false);
		expect(supportsCustomTemperature("gpt-5")).toBe(false);
		expect(supportsCustomTemperature("o1-preview")).toBe(false);
		expect(supportsCustomTemperature("o3-mini")).toBe(false);
	});

	it("returns true for other models", () => {
		expect(supportsCustomTemperature("gpt-4o")).toBe(true);
		expect(supportsCustomTemperature("gpt-4o-mini")).toBe(true);
	});
});

describe("applyTemperature", () => {
	it("omits temperature for gpt-5.x on api.openai.com", () => {
		const body: Record<string, unknown> = {};
		applyTemperature(body, "https://api.openai.com/v1", "gpt-5.5", 0.2);
		expect(body.temperature).toBeUndefined();
	});

	it("includes temperature for gpt-4o on api.openai.com", () => {
		const body: Record<string, unknown> = {};
		applyTemperature(body, "https://api.openai.com/v1", "gpt-4o", 0.2);
		expect(body.temperature).toBe(0.2);
	});

	it("includes temperature for non-OpenAI hosts regardless of model", () => {
		const body: Record<string, unknown> = {};
		applyTemperature(body, "https://example.com/v1", "gpt-5.5", 0.2);
		expect(body.temperature).toBe(0.2);
	});
});
