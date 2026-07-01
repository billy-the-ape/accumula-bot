import type { TelegramUserSettings } from "@/storage/telegramUserSettings.js";

export { DEFAULT_TELEGRAM_USER_SETTINGS } from "@/storage/telegramUserSettings.js";

export function formatUserDateTime(
	date: Date,
	settings: Pick<TelegramUserSettings, "locale" | "timezone">,
): string {
	if (settings.locale === null && settings.timezone === null) {
		return date.toISOString();
	}

	const options: Intl.DateTimeFormatOptions = {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		timeZoneName: "short",
	};

	if (settings.timezone !== null) {
		options.timeZone = settings.timezone;
	}

	return date.toLocaleString(settings.locale ?? undefined, options);
}

export function escapeUserDateTimeForMarkdown(
	date: Date,
	settings: Pick<TelegramUserSettings, "locale" | "timezone">,
): string {
	return formatUserDateTime(date, settings).replace(
		/([_*[\]()~`>#+\-=|{}.!\\])/g,
		"\\$1",
	);
}
