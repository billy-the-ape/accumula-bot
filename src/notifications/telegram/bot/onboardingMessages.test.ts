import { describe, expect, it } from "vitest";
import {
	botPlainText,
	formatStartingValuePrompt,
} from "@/notifications/telegram/bot/onboardingMessages.js";

describe("bot onboarding messages", () => {
	it("escapes MarkdownV2 reserved characters", () => {
		expect(formatStartingValuePrompt()).toContain("Accumula Bot\\!");
		expect(formatStartingValuePrompt()).not.toMatch(/Bot!(?!\\)/);
	});

	it("botPlainText escapes parentheses and periods", () => {
		expect(botPlainText(["Example (e.g. 10000)."])).toBe(
			"Example \\(e\\.g\\. 10000\\)\\.",
		);
	});
});
