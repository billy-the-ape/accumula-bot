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
			riskTolerance: "high",
		});
	});

	it("rejects unknown portfolio settings", () => {
		expect(parsePortfolioCommandArgs("foo=bar").kind).toBe("error");
	});
});
