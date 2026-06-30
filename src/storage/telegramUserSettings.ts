import z from "zod";

export const TelegramUserSettingsSchema = z.object({
	verbose: z.boolean(),
});

export type TelegramUserSettings = z.infer<typeof TelegramUserSettingsSchema>;

export const DEFAULT_TELEGRAM_USER_SETTINGS: TelegramUserSettings = {
	verbose: false,
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
	];

export function resolveTelegramUserSettings(
	verbose: boolean | null | undefined,
): TelegramUserSettings {
	return TelegramUserSettingsSchema.parse({
		verbose: verbose ?? DEFAULT_TELEGRAM_USER_SETTINGS.verbose,
	});
}
