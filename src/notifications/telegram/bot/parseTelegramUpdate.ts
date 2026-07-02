import {
	parseBotCommand,
	parseBotCommandArgs,
} from "@/notifications/telegram/bot/parseBotCommand.js";
import type { BotIncomingMessage } from "@/notifications/telegram/bot/types.js";
import {
	parseTelegramFromUser,
	type TelegramFromUser,
	type TelegramUpdate,
} from "@/notifications/telegram/telegramClient.js";

export type ParsedTelegramEvent = {
	updateId: number;
	chatId: string;
	from?: TelegramFromUser;
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
		const from = parseTelegramFromUser(update.callback_query.from);
		return {
			updateId: update.update_id,
			chatId,
			...(from ? { from } : {}),
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

	const from = parseTelegramFromUser(update.message?.from);
	const command = parseBotCommand(text);
	if (command) {
		const args = parseBotCommandArgs(text);
		return {
			updateId: update.update_id,
			chatId,
			...(from ? { from } : {}),
			incoming: {
				kind: "command",
				command,
				...(args ? { args } : {}),
			},
		};
	}

	return {
		updateId: update.update_id,
		chatId,
		...(from ? { from } : {}),
		incoming: { kind: "text", text },
	};
}
