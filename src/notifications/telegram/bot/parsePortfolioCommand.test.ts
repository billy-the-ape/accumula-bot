import { describe, expect, it } from "vitest";
import { parsePortfolioCommandArgs } from "@/notifications/telegram/bot/parsePortfolioCommand.js";

describe("parsePortfolioCommandArgs", () => {
	it("shows portfolio settings when args are empty", () => {
		expect(parsePortfolioCommandArgs(undefined)).toEqual({ kind: "show" });
	});

	it("shows risk keyboard prompt for /portfolio risk", () => {
		expect(parsePortfolioCommandArgs("risk")).toEqual({ kind: "show_risk" });
	});

	it("sets risk directly for /portfolio risk=high", () => {
		expect(parsePortfolioCommandArgs("risk=high")).toEqual({
			kind: "set",
			riskSetting: "high",
		});
	});

	it("sets custom min confidence for /portfolio risk=0.5", () => {
		expect(parsePortfolioCommandArgs("risk=0.5")).toEqual({
			kind: "set",
			riskSetting: "0.5",
		});
	});

	it("shows custom prompt for /portfolio risk=custom", () => {
		expect(parsePortfolioCommandArgs("risk=custom")).toEqual({
			kind: "show_custom_risk",
		});
	});

	it("rejects unknown portfolio settings", () => {
		expect(parsePortfolioCommandArgs("foo=bar").kind).toBe("error");
	});
});
