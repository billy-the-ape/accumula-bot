import type { TelegramInlineKeyboard } from "@/notifications/telegram/bot/types.js";
import {
	answerCallbackQuery,
	callTelegramApi,
	getTelegramUpdates,
	type TelegramApiOptions,
	type TelegramUpdate,
} from "@/notifications/telegram/telegramClient.js";

export type TelegramPollHandler = (update: TelegramUpdate) => Promise<void>;

export type RunTelegramPollOptions = TelegramApiOptions & {
	onUpdate: TelegramPollHandler;
	signal?: AbortSignal;
	pollTimeoutSeconds?: number;
	onError?: (error: unknown) => void;
};

export async function runTelegramPoll(
	options: RunTelegramPollOptions,
): Promise<void> {
	const pollTimeoutSeconds = options.pollTimeoutSeconds ?? 30;
	let offset: number | undefined;

	while (!options.signal?.aborted) {
		try {
			const updates = await getTelegramUpdates({
				botToken: options.botToken,
				...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
				...(offset !== undefined ? { offset } : {}),
				timeoutSeconds: pollTimeoutSeconds,
			});

			for (const update of updates) {
				if (options.signal?.aborted) {
					return;
				}

				await options.onUpdate(update);
				offset = update.update_id + 1;
			}

			if (updates.length === 0 && pollTimeoutSeconds === 0) {
				await sleep(250);
			}
		} catch (error) {
			if (options.signal?.aborted) {
				return;
			}

			if (options.onError) {
				options.onError(error);
			} else {
				throw error;
			}

			await sleep(1_000);
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export type SendBotReplyOptions = TelegramApiOptions & {
	chatId: string;
	text: string;
	replyMarkup?: TelegramInlineKeyboard;
};

export async function sendBotReply(
	options: SendBotReplyOptions,
): Promise<void> {
	await callTelegramApi(options, "sendMessage", {
		chat_id: options.chatId,
		text: options.text,
		parse_mode: "MarkdownV2",
		disable_web_page_preview: true,
		...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
	});
}

export async function acknowledgeCallbackQuery(
	options: TelegramApiOptions & {
		callbackQueryId: string;
		text?: string;
	},
): Promise<void> {
	await answerCallbackQuery(options, {
		callbackQueryId: options.callbackQueryId,
		...(options.text !== undefined ? { text: options.text } : {}),
	});
}
