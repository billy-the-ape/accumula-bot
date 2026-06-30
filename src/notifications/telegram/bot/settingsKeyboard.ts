import type { TelegramInlineKeyboard } from "@/notifications/telegram/bot/types.js";
import type {
	TelegramUserSettingKey,
	TelegramUserSettings,
} from "@/storage/telegramUserSettings.js";

export const SETTING_CALLBACK_PREFIX = "setting:";

export function settingCallbackData(
	key: TelegramUserSettingKey,
	value: boolean,
): string {
	return `${SETTING_CALLBACK_PREFIX}${key}:${value ? "1" : "0"}`;
}

export function parseSettingCallback(
	data: string,
): { key: TelegramUserSettingKey; value: boolean } | undefined {
	if (!data.startsWith(SETTING_CALLBACK_PREFIX)) {
		return undefined;
	}

	const payload = data.slice(SETTING_CALLBACK_PREFIX.length);
	const [key, rawValue] = payload.split(":");
	if (key !== "verbose" || (rawValue !== "0" && rawValue !== "1")) {
		return undefined;
	}

	return {
		key: "verbose",
		value: rawValue === "1",
	};
}

export function buildSettingsKeyboard(
	settings: TelegramUserSettings,
): TelegramInlineKeyboard {
	const verboseLabel = settings.verbose
		? "Verbose: ON (tap to turn off)"
		: "Verbose: OFF (tap to turn on)";

	return {
		inline_keyboard: [
			[
				{
					text: verboseLabel,
					callback_data: settingCallbackData("verbose", !settings.verbose),
				},
			],
		],
	};
}
