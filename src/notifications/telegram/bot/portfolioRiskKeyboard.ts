import type { TelegramInlineKeyboard } from "@/notifications/telegram/bot/types.js";
import {
	isPresetRiskTolerance,
	type PortfolioRiskSetting,
	portfolioRiskMatchesPreset,
	type RiskTolerance,
} from "@/risk/riskTolerance.js";

export const PORTFOLIO_RISK_CALLBACK_PREFIX = "portfolio_risk:";
export const PORTFOLIO_RISK_CUSTOM_CALLBACK = `${PORTFOLIO_RISK_CALLBACK_PREFIX}custom`;

export function portfolioRiskCallbackData(tolerance: RiskTolerance): string {
	return `${PORTFOLIO_RISK_CALLBACK_PREFIX}${tolerance}`;
}

export function parsePortfolioRiskCallback(
	data: string,
): RiskTolerance | "custom" | undefined {
	if (data === PORTFOLIO_RISK_CUSTOM_CALLBACK) {
		return "custom";
	}

	if (!data.startsWith(PORTFOLIO_RISK_CALLBACK_PREFIX)) {
		return undefined;
	}

	const value = data.slice(PORTFOLIO_RISK_CALLBACK_PREFIX.length);
	if (value === "low" || value === "medium" || value === "high") {
		return value;
	}

	return undefined;
}

export function buildPortfolioRiskKeyboard(
	current: PortfolioRiskSetting,
): TelegramInlineKeyboard {
	const presets: RiskTolerance[] = ["low", "medium", "high"];
	const rows = presets.map((tolerance) => [
		{
			text: portfolioRiskMatchesPreset(current, tolerance)
				? `${formatRiskLabel(tolerance)} ✓`
				: formatRiskLabel(tolerance),
			callback_data: portfolioRiskCallbackData(tolerance),
		},
	]);

	rows.push([
		{
			text: isPresetRiskTolerance(current) ? "Custom" : "Custom ✓",
			callback_data: PORTFOLIO_RISK_CUSTOM_CALLBACK,
		},
	]);

	return { inline_keyboard: rows };
}

function formatRiskLabel(tolerance: RiskTolerance): string {
	return tolerance.charAt(0).toUpperCase() + tolerance.slice(1);
}
