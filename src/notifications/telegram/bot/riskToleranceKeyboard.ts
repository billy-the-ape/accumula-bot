import type { TelegramInlineKeyboard } from "@/notifications/telegram/bot/types.js";
import type { RiskTolerance } from "@/risk/riskTolerance.js";

export const RISK_TOLERANCE_CALLBACK_PREFIX = "risk:";

export function riskToleranceCallbackData(tolerance: RiskTolerance): string {
	return `${RISK_TOLERANCE_CALLBACK_PREFIX}${tolerance}`;
}

export function parseRiskToleranceCallback(
	data: string,
): RiskTolerance | undefined {
	if (!data.startsWith(RISK_TOLERANCE_CALLBACK_PREFIX)) {
		return undefined;
	}

	const value = data.slice(RISK_TOLERANCE_CALLBACK_PREFIX.length);
	if (value === "low" || value === "medium" || value === "high") {
		return value;
	}

	return undefined;
}

export function buildRiskToleranceKeyboard(): TelegramInlineKeyboard {
	return {
		inline_keyboard: [
			[{ text: "Low", callback_data: riskToleranceCallbackData("low") }],
			[
				{
					text: "Medium",
					callback_data: riskToleranceCallbackData("medium"),
				},
			],
			[{ text: "High", callback_data: riskToleranceCallbackData("high") }],
		],
	};
}
