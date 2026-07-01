import z from "zod";
import type { RiskTolerance } from "@/risk/riskTolerance.js";

const RiskToleranceSchema = z.enum(["low", "medium", "high"]);

export const TelegramUserSettingsSchema = z.object({
	verbose: z.boolean(),
	defaultRiskTolerance: RiskToleranceSchema,
	locale: z.string().nullable(),
	timezone: z.string().nullable(),
});

export type TelegramUserSettings = z.infer<typeof TelegramUserSettingsSchema>;

export const DEFAULT_TELEGRAM_USER_SETTINGS: TelegramUserSettings = {
	verbose: false,
	defaultRiskTolerance: "medium",
	locale: null,
	timezone: null,
};

export type TelegramUserSettingKey = keyof TelegramUserSettings;

export type TelegramUserSettingDefinition = {
	key: TelegramUserSettingKey;
	label: string;
	description: string;
	commandExample: string;
};

export const TELEGRAM_USER_SETTING_DEFINITIONS: readonly TelegramUserSettingDefinition[] =
	[
		{
			key: "verbose",
			label: "Verbose hourly reports",
			description:
				"When on, receive full decision reports every hour. When off, only trade executions are sent.",
			commandExample: "/settings verbose=true",
		},
		{
			key: "defaultRiskTolerance",
			label: "Default risk tolerance",
			description:
				"Risk profile applied when you create a new paper or live portfolio.",
			commandExample: "/settings defaultRisk=medium",
		},
		{
			key: "locale",
			label: "Locale",
			description:
				"BCP 47 locale for formatting dates and times. Unset uses UTC ISO timestamps.",
			commandExample: "/settings locale=en-US",
		},
		{
			key: "timezone",
			label: "Timezone",
			description:
				"IANA time zone for formatting dates and times. Unset uses UTC ISO timestamps.",
			commandExample: "/settings timezone=America/New_York",
		},
	];

export type TelegramUserSettingsRowInput = {
	verbose?: boolean | null;
	defaultRiskTolerance?: string | null;
	locale?: string | null;
	timezone?: string | null;
};

function normalizeOptionalText(
	value: string | null | undefined,
): string | null {
	if (value === null || value === undefined) {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function parseRiskTolerance(value: string | null | undefined): RiskTolerance {
	const parsed = RiskToleranceSchema.safeParse(value ?? "medium");
	return parsed.success ? parsed.data : "medium";
}

export function isValidLocaleTag(value: string): boolean {
	try {
		const [canonical] = Intl.getCanonicalLocales(value.trim());
		return canonical !== undefined;
	} catch {
		return false;
	}
}

export function isValidTimeZone(value: string): boolean {
	try {
		Intl.DateTimeFormat(undefined, { timeZone: value.trim() });
		return true;
	} catch {
		return false;
	}
}

export function resolveTelegramUserSettings(
	row: TelegramUserSettingsRowInput = {},
): TelegramUserSettings {
	return TelegramUserSettingsSchema.parse({
		verbose: row.verbose ?? DEFAULT_TELEGRAM_USER_SETTINGS.verbose,
		defaultRiskTolerance: parseRiskTolerance(row.defaultRiskTolerance),
		locale: normalizeOptionalText(row.locale),
		timezone: normalizeOptionalText(row.timezone),
	});
}
