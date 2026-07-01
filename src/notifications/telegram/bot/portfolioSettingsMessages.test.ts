import { describe, expect, it } from "vitest";
import {
	formatPortfolioRiskUpdatedMessage,
	formatPortfolioSettingsMessage,
} from "@/notifications/telegram/bot/portfolioSettingsMessages.js";

describe("portfolioSettingsMessages", () => {
	it("escapes decimal min confidence in risk updated message", () => {
		const text = formatPortfolioRiskUpdatedMessage("high");

		expect(text).toContain("0\\.6");
		expect(text).not.toMatch(/[^\\]0\.6/);
	});

	it("escapes decimal min confidence in portfolio settings message", () => {
		const text = formatPortfolioSettingsMessage("medium");

		expect(text).toContain("0\\.67");
		expect(text).not.toMatch(/[^\\]0\.67/);
	});

	it("formats custom risk settings", () => {
		const text = formatPortfolioSettingsMessage("0.5");

		expect(text).toContain("Custom \\(0\\.5\\)");
		expect(text).toContain("0\\.5");
	});
});
