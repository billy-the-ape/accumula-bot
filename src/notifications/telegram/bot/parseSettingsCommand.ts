import type { TelegramUserSettings } from "@/storage/telegramUserSettings.js";

export type ParseSettingsCommandResult =
	| { kind: "show" }
	| { kind: "set"; patch: Partial<TelegramUserSettings> }
	| { kind: "error"; message: string };

function parseBooleanSettingValue(rawValue: string): boolean | undefined {
	const normalized = rawValue.trim().toLowerCase();
	if (normalized === "true" || normalized === "1" || normalized === "on") {
		return true;
	}
	if (normalized === "false" || normalized === "0" || normalized === "off") {
		return false;
	}

	return undefined;
}

export function parseSettingsCommandArgs(
	args: string | undefined,
): ParseSettingsCommandResult {
	const trimmed = args?.trim();
	if (!trimmed) {
		return { kind: "show" };
	}

	const [key, rawValue] = trimmed.split("=");
	if (!key || rawValue === undefined) {
		return {
			kind: "error",
			message: "Invalid settings syntax. Example: /settings verbose=true",
		};
	}

	if (key.trim().toLowerCase() !== "verbose") {
		return {
			kind: "error",
			message: `Unknown setting "${key.trim()}". Available: verbose`,
		};
	}

	const value = parseBooleanSettingValue(rawValue);
	if (value === undefined) {
		return {
			kind: "error",
			message: "verbose must be true or false",
		};
	}

	return {
		kind: "set",
		patch: { verbose: value },
	};
}
