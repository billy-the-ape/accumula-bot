import type { TelegramUserSettings } from "@/storage/telegramUserSettings.js";

export { DEFAULT_TELEGRAM_USER_SETTINGS } from "@/storage/telegramUserSettings.js";

export function formatUserDateTime(
	date: Date,
	{
		locale,
		timezone,
		formatOptions,
	}: Pick<TelegramUserSettings, "locale" | "timezone"> & {
		formatOptions?: Intl.DateTimeFormatOptions;
	},
): string {
	if (locale === null && timezone === null && !formatOptions) {
		return date.toISOString();
	}

	const options: Intl.DateTimeFormatOptions = formatOptions ?? {
		hour: "2-digit",
		minute: "2-digit",
		timeZoneName: "short",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	};

	if (timezone !== null) {
		options.timeZone = timezone;
	}

	return date.toLocaleString(locale ?? undefined, options);
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
