import { parseBotCommand } from "@/notifications/telegram/bot/parseBotCommand.js";
import type { BotIncomingMessage } from "@/notifications/telegram/bot/types.js";
import type { TelegramUpdate } from "@/notifications/telegram/telegramClient.js";

export type ParsedTelegramEvent = {
	updateId: number;
	chatId: string;
	callbackQueryId?: string;
	incoming: BotIncomingMessage;
};

function chatIdFromUpdate(update: TelegramUpdate): string | undefined {
	if (update.callback_query?.message?.chat.id !== undefined) {
		return String(update.callback_query.message.chat.id);
	}

	if (update.message?.chat.id !== undefined) {
		return String(update.message.chat.id);
	}

	return undefined;
}

export function parseTelegramUpdate(
	update: TelegramUpdate,
): ParsedTelegramEvent | undefined {
	const chatId = chatIdFromUpdate(update);
	if (!chatId) {
		return undefined;
	}

	if (update.callback_query?.data) {
		return {
			updateId: update.update_id,
			chatId,
			callbackQueryId: update.callback_query.id,
			incoming: {
				kind: "callback",
				data: update.callback_query.data,
			},
		};
	}

	const text = update.message?.text?.trim();
	if (!text) {
		return undefined;
	}

	const command = parseBotCommand(text);
	if (command) {
		return {
			updateId: update.update_id,
			chatId,
			incoming: { kind: "command", command },
		};
	}

	return {
		updateId: update.update_id,
		chatId,
		incoming: { kind: "text", text },
	};
}
