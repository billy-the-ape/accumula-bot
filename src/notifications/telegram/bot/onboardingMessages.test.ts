import { describe, expect, it } from "vitest";
import {
	botPlainText,
	formatStartingValuePrompt,
} from "@/notifications/telegram/bot/onboardingMessages.js";

describe("bot onboarding messages", () => {
	it("escapes MarkdownV2 reserved characters", () => {
		expect(formatStartingValuePrompt()).toContain(
			"__Welcome to Accumula Bot__",
		);
		expect(formatStartingValuePrompt()).toContain("Tap Default for $10,000");
	});

	it("botPlainText escapes parentheses and periods", () => {
		expect(botPlainText(["Example (e.g. 10000)."])).toBe(
			"Example \\(e\\.g\\. 10000\\)\\.",
		);
	});
});
