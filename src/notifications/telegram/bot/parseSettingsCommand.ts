import type { RiskTolerance } from "@/risk/riskTolerance.js";
import {
	isValidLocaleTag,
	isValidTimeZone,
	type TelegramUserSettings,
} from "@/storage/telegramUserSettings.js";

export type ParseSettingsCommandResult =
	| { kind: "show" }
	| { kind: "prompt"; key: "locale" | "timezone" }
	| { kind: "set"; patch: Partial<TelegramUserSettings> }
	| { kind: "error"; message: string };

const SETTING_ALIASES: Record<string, keyof TelegramUserSettings> = {
	verbose: "verbose",
	defaultrisk: "defaultRiskTolerance",
	locale: "locale",
	timezone: "timezone",
};

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

function parseRiskToleranceValue(rawValue: string): RiskTolerance | undefined {
	const normalized = rawValue.trim().toLowerCase();
	if (
		normalized === "low" ||
		normalized === "medium" ||
		normalized === "high"
	) {
		return normalized;
	}

	return undefined;
}

function normalizeSettingKey(
	rawKey: string,
): keyof TelegramUserSettings | undefined {
	return SETTING_ALIASES[rawKey.trim().toLowerCase().replace(/_/g, "")];
}

export function parseSettingsCommandArgs(
	args: string | undefined,
): ParseSettingsCommandResult {
	const trimmed = args?.trim();
	if (!trimmed) {
		return { kind: "show" };
	}

	const [keyPart, rawValue] = trimmed.split("=");
	const key = keyPart ? normalizeSettingKey(keyPart) : undefined;
	if (!key) {
		return {
			kind: "error",
			message: `Unknown setting "${keyPart?.trim() ?? ""}". Available: verbose, defaultRisk, locale, timezone`,
		};
	}

	if (rawValue === undefined) {
		if (key === "locale" || key === "timezone") {
			return { kind: "prompt", key };
		}

		return {
			kind: "error",
			message: `Invalid settings syntax. Example: /settings ${key}=value`,
		};
	}

	if (key === "verbose") {
		const value = parseBooleanSettingValue(rawValue);
		if (value === undefined) {
			return { kind: "error", message: "verbose must be true or false" };
		}

		return { kind: "set", patch: { verbose: value } };
	}

	if (key === "defaultRiskTolerance") {
		const value = parseRiskToleranceValue(rawValue);
		if (!value) {
			return {
				kind: "error",
				message: "defaultRisk must be low, medium, or high",
			};
		}

		return { kind: "set", patch: { defaultRiskTolerance: value } };
	}

	if (key === "locale") {
		const value = rawValue.trim();
		if (!isValidLocaleTag(value)) {
			return { kind: "error", message: "locale must be a valid BCP 47 tag" };
		}

		return { kind: "set", patch: { locale: value } };
	}

	const value = rawValue.trim();
	if (!isValidTimeZone(value)) {
		return {
			kind: "error",
			message: "timezone must be a valid IANA time zone",
		};
	}

	return { kind: "set", patch: { timezone: value } };
}

export function parseSettingsTextInput(
	onboardingState: "awaiting_settings_locale" | "awaiting_settings_timezone",
	text: string,
): ParseSettingsCommandResult {
	if (onboardingState === "awaiting_settings_locale") {
		const value = text.trim();
		if (!isValidLocaleTag(value)) {
			return { kind: "error", message: "locale must be a valid BCP 47 tag" };
		}

		return { kind: "set", patch: { locale: value } };
	}

	const value = text.trim();
	if (!isValidTimeZone(value)) {
		return {
			kind: "error",
			message: "timezone must be a valid IANA time zone",
		};
	}

	return { kind: "set", patch: { timezone: value } };
}
