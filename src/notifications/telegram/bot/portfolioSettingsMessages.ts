import {
	bold,
	boldUnderline,
	code,
	escapeMarkdownV2,
} from "@/notifications/telegram/escapeMarkdownV2.js";
import {
	MIN_CONFIDENCE_BY_RISK_TOLERANCE,
	type RiskTolerance,
} from "@/risk/riskTolerance.js";

function formatRiskLabel(tolerance: RiskTolerance): string {
	return tolerance.charAt(0).toUpperCase() + tolerance.slice(1);
}

export function formatPortfolioSettingsMessage(
	riskTolerance: RiskTolerance,
): string {
	const minConfidence = MIN_CONFIDENCE_BY_RISK_TOLERANCE[riskTolerance];
	return [
		boldUnderline("Portfolio Settings"),
		"",
		`${bold("Risk tolerance")} — ${bold(formatRiskLabel(riskTolerance))}`,
		`Min confidence to trade: ${bold(String(minConfidence))}`,
		escapeMarkdownV2(
			"Adjust how aggressively the bot trades on this portfolio.",
		),
		`Set via: ${code("/portfolio risk=medium")}`,
		`Or send: ${code("/portfolio risk")} to pick from buttons`,
	].join("\n");
}

export function formatPortfolioRiskPromptMessage(
	riskTolerance: RiskTolerance,
): string {
	return [
		boldUnderline("Portfolio risk tolerance"),
		"",
		`Current: ${bold(formatRiskLabel(riskTolerance))}`,
		escapeMarkdownV2("Choose a new risk level:"),
	].join("\n");
}

export function formatPortfolioRiskUpdatedMessage(
	riskTolerance: RiskTolerance,
): string {
	const minConfidence = MIN_CONFIDENCE_BY_RISK_TOLERANCE[riskTolerance];
	return `${bold("Risk tolerance")} set to ${bold(formatRiskLabel(riskTolerance))} \\(min confidence ${bold(String(minConfidence))}\\)\\.`;
}

export const NO_ACTIVE_PORTFOLIO_FOR_PORTFOLIO_COMMAND =
	"No active portfolio\\. Create one with /start first\\.";
