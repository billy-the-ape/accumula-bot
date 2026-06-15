import type { TelegramConfig } from "@/config/appConfigSchema.js";
import {
	formatRunFailure,
	formatRunReport,
	type RunReportInput,
} from "@/notifications/telegram/formatRunReport.js";
import { sendTelegramMessage } from "@/notifications/telegram/telegramClient.js";

type NotifyOptions = { fetchImpl?: typeof fetch };

/** Send the verbose run report. Called on every run, not just on trades. */
export async function notifyRun(
	telegram: TelegramConfig,
	input: RunReportInput,
	options: NotifyOptions = {},
): Promise<void> {
	await sendTelegramMessage(
		{
			botToken: telegram.botToken,
			chatId: telegram.chatId,
			...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
		},
		formatRunReport(input),
	);
}

/** Send a failure alert when the run throws before a report can be built. */
export async function notifyRunFailure(
	telegram: TelegramConfig,
	message: string,
	options: NotifyOptions = {},
): Promise<void> {
	await sendTelegramMessage(
		{
			botToken: telegram.botToken,
			chatId: telegram.chatId,
			...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
		},
		formatRunFailure(message),
	);
}
