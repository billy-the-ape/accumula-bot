import { describe, expect, it } from "vitest";
import {
	DEFAULT_TELEGRAM_USER_SETTINGS,
	isValidLocaleTag,
	isValidTimeZone,
	resolveTelegramUserSettings,
} from "@/storage/telegramUserSettings.js";

describe("resolveTelegramUserSettings", () => {
	it("returns defaults when row fields are missing", () => {
		expect(resolveTelegramUserSettings({})).toEqual(
			DEFAULT_TELEGRAM_USER_SETTINGS,
		);
	});

	it("preserves explicit locale and timezone when set", () => {
		expect(
			resolveTelegramUserSettings({
				verbose: true,
				defaultRiskTolerance: "high",
				locale: "en-GB",
				timezone: "Europe/London",
			}),
		).toEqual({
			verbose: true,
			defaultRiskTolerance: "high",
			locale: "en-GB",
			timezone: "Europe/London",
		});
	});

	it("normalizes blank locale and timezone to null", () => {
		expect(
			resolveTelegramUserSettings({
				locale: "  ",
				timezone: "",
			}),
		).toEqual({
			...DEFAULT_TELEGRAM_USER_SETTINGS,
			locale: null,
			timezone: null,
		});
	});
});

describe("locale and timezone validation", () => {
	it("accepts common locale tags", () => {
		expect(isValidLocaleTag("en-US")).toBe(true);
		expect(isValidLocaleTag("de-DE")).toBe(true);
	});

	it("rejects invalid locale tags", () => {
		expect(isValidLocaleTag("not-a-locale!!!")).toBe(false);
	});

	it("accepts IANA time zones", () => {
		expect(isValidTimeZone("UTC")).toBe(true);
		expect(isValidTimeZone("America/New_York")).toBe(true);
	});

	it("rejects invalid time zones", () => {
		expect(isValidTimeZone("Not/A_TimeZone")).toBe(false);
	});
});
