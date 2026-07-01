import type { RiskTolerance } from "@/risk/riskTolerance.js";

export type ParsePortfolioCommandResult =
	| { kind: "show" }
	| { kind: "show_risk" }
	| { kind: "set"; riskTolerance: RiskTolerance }
	| { kind: "error"; message: string };

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

	const riskTolerance = parseRiskToleranceValue(rawValue);
	if (!riskTolerance) {
		return {
			kind: "error",
			message: "risk must be low, medium, or high",
		};
	}

	return { kind: "set", riskTolerance };
}
