import {
	bold,
	boldUnderline,
	code,
	escapeMarkdownV2,
} from "@/notifications/telegram/escapeMarkdownV2.js";
import {
	formatPortfolioRiskLabel,
	type PortfolioRiskSetting,
	resolveMinConfidence,
} from "@/risk/riskTolerance.js";

export function formatPortfolioSettingsMessage(
	riskSetting: PortfolioRiskSetting,
): string {
	const minConfidence = resolveMinConfidence(riskSetting);
	return [
		boldUnderline("Portfolio Settings"),
		"",
		`${bold("Risk tolerance")} — ${bold(formatPortfolioRiskLabel(riskSetting))}`,
		`Min confidence to trade: ${bold(String(minConfidence))}`,
		escapeMarkdownV2(
			"Adjust how aggressively the bot trades on this portfolio.",
		),
		`Set via: ${code("/portfolio risk=medium")} or ${code("/portfolio risk=0.5")}`,
		`Or send: ${code("/portfolio risk")} to pick from buttons`,
	].join("\n");
}

export function formatPortfolioRiskPromptMessage(
	riskSetting: PortfolioRiskSetting,
): string {
	return [
		boldUnderline("Portfolio risk tolerance"),
		"",
		`Current: ${bold(formatPortfolioRiskLabel(riskSetting))}`,
		escapeMarkdownV2("Choose a new risk level:"),
	].join("\n");
}

export function formatPortfolioCustomRiskPromptMessage(): string {
	return [
		boldUnderline("Custom risk tolerance"),
		"",
		escapeMarkdownV2(
			"Send a min confidence value between 0 and 1 (for example 0.5).",
		),
		`Direct set: ${code("/portfolio risk=0.5")}`,
	].join("\n");
}

export function formatPortfolioRiskUpdatedMessage(
	riskSetting: PortfolioRiskSetting,
): string {
	const minConfidence = resolveMinConfidence(riskSetting);
	return `${bold("Risk tolerance")} set to ${bold(formatPortfolioRiskLabel(riskSetting))} \\(min confidence ${bold(String(minConfidence))}\\)\\.`;
}

export const NO_ACTIVE_PORTFOLIO_FOR_PORTFOLIO_COMMAND =
	"No active portfolio\\. Create one with /start first\\.";

export function formatNavLiquidateCancelledMessage(): string {
	return escapeMarkdownV2("Portfolio close cancelled.");
}
