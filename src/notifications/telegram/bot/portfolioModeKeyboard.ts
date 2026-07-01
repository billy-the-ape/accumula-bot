import type { PortfolioMode } from "@/live/portfolioMode.js";
import type { TelegramInlineKeyboard } from "@/notifications/telegram/bot/types.js";

export const PORTFOLIO_MODE_CALLBACK_PREFIX = "mode:";

export function portfolioModeCallbackData(mode: PortfolioMode): string {
	return `${PORTFOLIO_MODE_CALLBACK_PREFIX}${mode}`;
}

export function parsePortfolioModeCallback(
	data: string,
): PortfolioMode | undefined {
	if (!data.startsWith(PORTFOLIO_MODE_CALLBACK_PREFIX)) {
		return undefined;
	}

	const value = data.slice(PORTFOLIO_MODE_CALLBACK_PREFIX.length);
	if (value === "paper" || value === "live") {
		return value;
	}

	return undefined;
}

export function buildPortfolioModeKeyboard(): TelegramInlineKeyboard {
	return {
		inline_keyboard: [
			[
				{
					text: "Paper (simulated)",
					callback_data: portfolioModeCallbackData("paper"),
				},
			],
			[
				{
					text: "Live (Base USDC)",
					callback_data: portfolioModeCallbackData("live"),
				},
			],
		],
	};
}
