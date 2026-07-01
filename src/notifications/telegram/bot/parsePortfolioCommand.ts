import type { PortfolioRiskSetting } from "@/risk/riskTolerance.js";
import { parsePortfolioRiskInput } from "@/risk/riskTolerance.js";

export type ParsePortfolioCommandResult =
	| { kind: "show" }
	| { kind: "show_risk" }
	| { kind: "show_custom_risk" }
	| { kind: "set"; riskSetting: PortfolioRiskSetting }
	| { kind: "error"; message: string };

export function parsePortfolioCommandArgs(
	args: string | undefined,
): ParsePortfolioCommandResult {
	const trimmed = args?.trim();
	if (!trimmed) {
		return { kind: "show" };
	}

	const [key, rawValue] = trimmed.split("=");
	const normalizedKey = key?.trim().toLowerCase();

	if (normalizedKey !== "risk") {
		return {
			kind: "error",
			message: `Unknown portfolio setting "${key?.trim() ?? ""}". Available: risk`,
		};
	}

	if (rawValue === undefined) {
		return { kind: "show_risk" };
	}

	if (rawValue.trim().toLowerCase() === "custom") {
		return { kind: "show_custom_risk" };
	}

	const riskSetting = parsePortfolioRiskInput(rawValue);
	if (!riskSetting) {
		return {
			kind: "error",
			message:
				"risk must be low, medium, high, custom, or a number between 0 and 1",
		};
	}

	return { kind: "set", riskSetting };
}
