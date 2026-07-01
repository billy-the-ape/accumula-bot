import { describe, expect, it } from "vitest";
import { parseSettingsCommandArgs } from "@/notifications/telegram/bot/parseSettingsCommand.js";

describe("parseSettingsCommandArgs", () => {
	it("shows settings when args are empty", () => {
		expect(parseSettingsCommandArgs(undefined)).toEqual({ kind: "show" });
	});

	it("sets verbose directly", () => {
		expect(parseSettingsCommandArgs("verbose=true")).toEqual({
			kind: "set",
			patch: { verbose: true },
		});
	});

	it("sets defaultRisk directly", () => {
		expect(parseSettingsCommandArgs("defaultRisk=high")).toEqual({
			kind: "set",
			patch: { defaultRiskTolerance: "high" },
		});
	});

	it("prompts for locale when value is omitted", () => {
		expect(parseSettingsCommandArgs("locale")).toEqual({
			kind: "prompt",
			key: "locale",
		});
	});

	it("sets locale directly", () => {
		expect(parseSettingsCommandArgs("locale=en-US")).toEqual({
			kind: "set",
			patch: { locale: "en-US" },
		});
	});

	it("rejects invalid locale values", () => {
		expect(parseSettingsCommandArgs("locale=not-valid!!!").kind).toBe("error");
	});
});
