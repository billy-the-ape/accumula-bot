import {
	bold,
	boldUnderline,
	escapeMarkdownV2,
} from "@/notifications/telegram/escapeMarkdownV2.js";
import {
	TELEGRAM_USER_SETTING_DEFINITIONS,
	type TelegramUserSettings,
} from "@/storage/telegramUserSettings.js";

function formatSettingValue(value: boolean): string {
	return value ? bold("true") : bold("false");
}

export function formatSettingsMessage(settings: TelegramUserSettings): string {
	const lines: string[] = [boldUnderline("Settings"), ""];

	for (const definition of TELEGRAM_USER_SETTING_DEFINITIONS) {
		const value = settings[definition.key];
		lines.push(
			`${bold(definition.label)} — ${formatSettingValue(value)}`,
			escapeMarkdownV2(definition.description),
			`Set via: ${escapeMarkdownV2(definition.commandExample)}`,
			"",
		);
	}

	return lines.join("\n").trimEnd();
}

export function formatSettingsUpdatedMessage(
	key: keyof TelegramUserSettings,
	value: boolean,
): string {
	const definition = TELEGRAM_USER_SETTING_DEFINITIONS.find(
		(candidate) => candidate.key === key,
	);
	const label = definition?.label ?? key;
	return `${bold(label)} set to ${formatSettingValue(value)}\\.`;
}

export const DECISION_NOT_FOUND_MESSAGE = "Decision not found\\.";
