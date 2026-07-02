import { describe, expect, it } from "vitest";
import {
	DEFAULT_TELEGRAM_USER_SETTINGS,
	escapeUserDateTimeForMarkdown,
	formatUserDateTime,
} from "@/notifications/telegram/formatUserDateTime.js";
import type { TelegramUserSettings } from "@/storage/telegramUserSettings.js";

describe("formatUserDateTime", () => {
	const date = new Date("2026-06-16T15:30:00.000Z");

	it("uses ISO UTC when locale and timezone are unset", () => {
		expect(formatUserDateTime(date, DEFAULT_TELEGRAM_USER_SETTINGS)).toBe(
			"2026-06-16T15:30:00.000Z",
		);
	});

	it("formats with user locale and timezone when set", () => {
		const settings: TelegramUserSettings = {
			...DEFAULT_TELEGRAM_USER_SETTINGS,
			locale: "en-US",
			timezone: "America/New_York",
		};

		expect(formatUserDateTime(date, settings)).toBe(
			formatUserDateTime(date, settings),
		);
		expect(formatUserDateTime(date, settings)).toContain("2026");
		expect(formatUserDateTime(date, settings)).toContain(
			"06/16/2026, 11:30 AM EDT",
		);
	});

	it("uses locale only when timezone is unset", () => {
		const settings: TelegramUserSettings = {
			...DEFAULT_TELEGRAM_USER_SETTINGS,
			locale: "en-GB",
			timezone: null,
		};

		expect(formatUserDateTime(date, settings)).toContain("2026");
		expect(formatUserDateTime(date, settings)).toContain("30");
	});

	it("escapes markdown characters for Telegram", () => {
		expect(
			escapeUserDateTimeForMarkdown(date, DEFAULT_TELEGRAM_USER_SETTINGS),
		).toBe("2026\\-06\\-16T15:30:00\\.000Z");
	});
});
