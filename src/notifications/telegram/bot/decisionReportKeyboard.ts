import type { TelegramInlineKeyboard } from "@/notifications/telegram/bot/types.js";

export const DECISION_CALLBACK_PREFIX = "decision:";
export const MACRO_CALLBACK_PREFIX = "macro:";

export function decisionCallbackData(decisionId: number): string {
	return `${DECISION_CALLBACK_PREFIX}${decisionId}`;
}

export function macroCallbackData(decisionId: number): string {
	return `${MACRO_CALLBACK_PREFIX}${decisionId}`;
}

export function parseDecisionCallback(data: string): number | undefined {
	if (!data.startsWith(DECISION_CALLBACK_PREFIX)) {
		return undefined;
	}

	const rawId = data.slice(DECISION_CALLBACK_PREFIX.length);
	const id = Number.parseInt(rawId, 10);
	return Number.isInteger(id) && id > 0 ? id : undefined;
}

export function parseMacroCallback(data: string): number | undefined {
	if (!data.startsWith(MACRO_CALLBACK_PREFIX)) {
		return undefined;
	}

	const rawId = data.slice(MACRO_CALLBACK_PREFIX.length);
	const id = Number.parseInt(rawId, 10);
	return Number.isInteger(id) && id > 0 ? id : undefined;
}

export function buildDecisionReportKeyboard(
	decisionId: number,
): TelegramInlineKeyboard {
	return {
		inline_keyboard: [
			[
				{
					text: "View decision",
					callback_data: decisionCallbackData(decisionId),
				},
				{
					text: "View macro",
					callback_data: macroCallbackData(decisionId),
				},
			],
		],
	};
}
