import type { TelegramConfig } from "@/config/appConfigSchema.js";
import {
	formatTradeNotification,
	type TradeNotificationInput,
} from "@/notifications/telegram/formatTradeMessage.js";
import { sendTelegramMessage } from "@/notifications/telegram/telegramClient.js";

export async function notifyTrades(
	telegram: TelegramConfig,
	input: TradeNotificationInput,
	options: { fetchImpl?: typeof fetch } = {},
): Promise<void> {
	const text = formatTradeNotification(input);
	await sendTelegramMessage(
		{
			botToken: telegram.botToken,
			chatId: telegram.chatId,
			...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
		},
		text,
	);
}
