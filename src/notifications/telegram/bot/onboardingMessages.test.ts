import { describe, expect, it } from "vitest";
import {
	botPlainText,
	formatLiveDepositInstructions,
	formatPortfolioModePrompt,
	formatStartingValuePrompt,
} from "@/notifications/telegram/bot/onboardingMessages.js";

describe("bot onboarding messages", () => {
	it("escapes MarkdownV2 reserved characters", () => {
		expect(formatPortfolioModePrompt()).toContain(
			"__Welcome to Accumula Bot__",
		);
		expect(formatStartingValuePrompt()).toContain("Tap Default for $10,000");
	});

	it("includes live deposit instructions", () => {
		const text = formatLiveDepositInstructions("0xabc", 1000);
		expect(text).toContain("Only deposit USDC on Base");
		expect(text).toContain("30 minutes");
		expect(text).toContain("/start");
	});

	it("botPlainText escapes parentheses and periods", () => {
		expect(botPlainText(["Example (e.g. 10000)."])).toBe(
			"Example \\(e\\.g\\. 10000\\)\\.",
		);
	});
});
