import { describe, expect, it } from "vitest";
import {
	formatSettingsMessage,
	formatSettingsUpdatedMessage,
} from "@/notifications/telegram/bot/settingsMessages.js";
import type { TelegramUserSettings } from "@/storage/telegramUserSettings.js";

const settings: TelegramUserSettings = {
	verbose: true,
	defaultRiskTolerance: "high",
	locale: "en-US",
	timezone: "America/Denver",
};

describe("formatSettingsMessage", () => {
	it("does not double-escape locale hyphens inside bold values", () => {
		const text = formatSettingsMessage(settings);

		expect(text).toContain("*en\\-US*");
		expect(text).not.toContain("*en\\\\-US*");
	});

	it("does not double-escape timezone values inside bold", () => {
		const text = formatSettingsMessage(settings);

		expect(text).toContain("*America/Denver*");
	});
});

describe("formatSettingsUpdatedMessage", () => {
	it("formats updated locale without double escaping", () => {
		const text = formatSettingsUpdatedMessage("locale", "en-US");

		expect(text).toContain("*en\\-US*");
		expect(text).not.toContain("*en\\\\-US*");
	});
});
