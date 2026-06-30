import { DEFAULT_PAPER_STARTING_CASH_USD } from "@/execution/paperExecution.js";
import type { TelegramInlineKeyboard } from "@/notifications/telegram/bot/types.js";

export const STARTING_VALUE_CALLBACK_PREFIX = "starting_value:";

export const STARTING_VALUE_DEFAULT_CALLBACK = `${STARTING_VALUE_CALLBACK_PREFIX}default`;

export function parseStartingValueCallback(data: string): number | undefined {
	if (data !== STARTING_VALUE_DEFAULT_CALLBACK) {
		return undefined;
	}

	return DEFAULT_PAPER_STARTING_CASH_USD;
}

export function buildStartingValueKeyboard(): TelegramInlineKeyboard {
	return {
		inline_keyboard: [
			[
				{
					text: "Default",
					callback_data: STARTING_VALUE_DEFAULT_CALLBACK,
				},
			],
		],
	};
}
