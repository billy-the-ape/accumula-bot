import type { TelegramInlineKeyboard } from "@/notifications/telegram/bot/types.js";
import type {
	TelegramUserSettingKey,
	TelegramUserSettings,
} from "@/storage/telegramUserSettings.js";

export const SETTING_CALLBACK_PREFIX = "setting:";

export const COMMON_LOCALE_OPTIONS = [
	"en-US",
	"en-GB",
	"de-DE",
	"fr-FR",
	"es-ES",
	"ja-JP",
] as const;

export const COMMON_TIMEZONE_OPTIONS = [
	"UTC",
	"America/New_York",
	"America/Chicago",
	"America/Los_Angeles",
	"Europe/London",
	"Europe/Berlin",
	"Asia/Tokyo",
] as const;

export function settingCallbackData(
	key: TelegramUserSettingKey,
	value: boolean,
): string {
	return `${SETTING_CALLBACK_PREFIX}${key}:${value ? "1" : "0"}`;
}

export function settingValueCallbackData(
	key: "defaultRiskTolerance" | "locale" | "timezone",
	value: string,
): string {
	return `${SETTING_CALLBACK_PREFIX}${key}:${value}`;
}

export function parseSettingCallback(
	data: string,
):
	| { key: "verbose"; value: boolean }
	| { key: "defaultRiskTolerance"; value: string }
	| { key: "locale"; value: string }
	| { key: "timezone"; value: string }
	| undefined {
	if (!data.startsWith(SETTING_CALLBACK_PREFIX)) {
		return undefined;
	}

	const payload = data.slice(SETTING_CALLBACK_PREFIX.length);
	const separatorIndex = payload.indexOf(":");
	if (separatorIndex <= 0) {
		return undefined;
	}

	const key = payload.slice(0, separatorIndex);
	const rawValue = payload.slice(separatorIndex + 1);

	if (key === "verbose") {
		if (rawValue !== "0" && rawValue !== "1") {
			return undefined;
		}

		return { key: "verbose", value: rawValue === "1" };
	}

	if (key === "defaultRiskTolerance") {
		if (rawValue !== "low" && rawValue !== "medium" && rawValue !== "high") {
			return undefined;
		}

		return { key: "defaultRiskTolerance", value: rawValue };
	}

	if (key === "locale" || key === "timezone") {
		return { key, value: rawValue };
	}

	return undefined;
}

export function buildSettingsKeyboard(
	settings: TelegramUserSettings,
): TelegramInlineKeyboard {
	const verboseLabel = settings.verbose
		? "🟢 Verbose: ON (tap to turn off)"
		: "🔴 Verbose: OFF (tap to turn on)";

	return {
		inline_keyboard: [
			[
				{
					text: verboseLabel,
					callback_data: settingCallbackData("verbose", !settings.verbose),
				},
			],
			[
				{
					text: `Default risk: ${settings.defaultRiskTolerance}`,
					callback_data: "setting_menu:defaultRisk",
				},
			],
			[
				{
					text: `Locale: ${settings.locale ?? "unset"}`,
					callback_data: "setting_menu:locale",
				},
			],
			[
				{
					text: `Timezone: ${settings.timezone ?? "unset"}`,
					callback_data: "setting_menu:timezone",
				},
			],
		],
	};
}

export function buildDefaultRiskKeyboard(
	current: TelegramUserSettings["defaultRiskTolerance"],
): TelegramInlineKeyboard {
	return {
		inline_keyboard: (["low", "medium", "high"] as const).map((value) => [
			{
				text: value === current ? `${value} ✓` : value,
				callback_data: settingValueCallbackData("defaultRiskTolerance", value),
			},
		]),
	};
}

export function buildLocaleKeyboard(
	current: string | null,
): TelegramInlineKeyboard {
	return {
		inline_keyboard: COMMON_LOCALE_OPTIONS.map((locale) => [
			{
				text: locale === current ? `${locale} ✓` : locale,
				callback_data: settingValueCallbackData("locale", locale),
			},
		]),
	};
}

export function buildTimezoneKeyboard(
	current: string | null,
): TelegramInlineKeyboard {
	return {
		inline_keyboard: COMMON_TIMEZONE_OPTIONS.map((timezone) => [
			{
				text: timezone === current ? `${timezone} ✓` : timezone,
				callback_data: settingValueCallbackData("timezone", timezone),
			},
		]),
	};
}

export function parseSettingMenuCallback(
	data: string,
): "defaultRisk" | "locale" | "timezone" | undefined {
	if (!data.startsWith("setting_menu:")) {
		return undefined;
	}

	const value = data.slice("setting_menu:".length);
	if (value === "defaultRisk" || value === "locale" || value === "timezone") {
		return value;
	}

	return undefined;
}
