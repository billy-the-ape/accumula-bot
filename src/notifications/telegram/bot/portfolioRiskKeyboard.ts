import type { TelegramInlineKeyboard } from "@/notifications/telegram/bot/types.js";
import type { RiskTolerance } from "@/risk/riskTolerance.js";

export const PORTFOLIO_RISK_CALLBACK_PREFIX = "portfolio_risk:";

export function portfolioRiskCallbackData(tolerance: RiskTolerance): string {
	return `${PORTFOLIO_RISK_CALLBACK_PREFIX}${tolerance}`;
}

export function parsePortfolioRiskCallback(
	data: string,
): RiskTolerance | undefined {
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
	current: RiskTolerance,
): TelegramInlineKeyboard {
	const options: RiskTolerance[] = ["low", "medium", "high"];
	return {
		inline_keyboard: options.map((tolerance) => [
			{
				text:
					tolerance === current
						? `${formatRiskLabel(tolerance)} ✓`
						: formatRiskLabel(tolerance),
				callback_data: portfolioRiskCallbackData(tolerance),
			},
		]),
	};
}

function formatRiskLabel(tolerance: RiskTolerance): string {
	return tolerance.charAt(0).toUpperCase() + tolerance.slice(1);
}
