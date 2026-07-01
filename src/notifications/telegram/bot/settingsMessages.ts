import {
	bold,
	boldUnderline,
	code,
	escapeMarkdownV2,
} from "@/notifications/telegram/escapeMarkdownV2.js";
import {
	TELEGRAM_USER_SETTING_DEFINITIONS,
	type TelegramUserSettingKey,
	type TelegramUserSettings,
} from "@/storage/telegramUserSettings.js";

function formatSettingValue(
	key: TelegramUserSettingKey,
	value: TelegramUserSettings[TelegramUserSettingKey],
): string {
	if (key === "verbose") {
		return value === true ? bold("ON") : bold("OFF");
	}

	if (key === "defaultRiskTolerance") {
		return bold(String(value));
	}

	if (value === null) {
		return bold("unset");
	}

	return bold(String(value));
}

function settingStatusEmoji(
	key: TelegramUserSettingKey,
	value: TelegramUserSettings[TelegramUserSettingKey],
): string {
	if (key === "verbose") {
		return value === true ? "🟢" : "🔴";
	}

	return value === null ? "⚪" : "🟢";
}

export function formatSettingsMessage(settings: TelegramUserSettings): string {
	const lines: string[] = [boldUnderline("User Settings"), ""];

	for (const definition of TELEGRAM_USER_SETTING_DEFINITIONS) {
		const value = settings[definition.key];
		lines.push(
			`${settingStatusEmoji(definition.key, value)} ${bold(definition.label)} — ${formatSettingValue(definition.key, value)}`,
			escapeMarkdownV2(definition.description),
			`Set via: ${code(definition.commandExample)}`,
			"",
		);
	}

	return lines.join("\n").trimEnd();
}

export function formatSettingsUpdatedMessage<K extends TelegramUserSettingKey>(
	key: K,
	value: TelegramUserSettings[K],
): string {
	const definition = TELEGRAM_USER_SETTING_DEFINITIONS.find(
		(candidate) => candidate.key === key,
	);
	const label = definition?.label ?? key;
	return `${bold(label)} set to ${formatSettingValue(key, value)}\\.`;
}

export const DECISION_NOT_FOUND_MESSAGE = "Decision not found\\.";

export function formatLocalePromptMessage(): string {
	return [
		boldUnderline("Locale"),
		"",
		escapeMarkdownV2(
			"Send a BCP 47 locale tag (for example en-US), or pick a common option below.",
		),
		`Direct set: ${code("/settings locale=en-US")}`,
	].join("\n");
}

export function formatTimezonePromptMessage(): string {
	return [
		boldUnderline("Timezone"),
		"",
		escapeMarkdownV2(
			"Send an IANA time zone (for example America/New_York), or pick a common option below.",
		),
		`Direct set: ${code("/settings timezone=UTC")}`,
	].join("\n");
}
