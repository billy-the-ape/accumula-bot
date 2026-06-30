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
	botToken: string,
	chatId: string,
	input: RunReportInput,
	options: NotifyOptions = {},
): Promise<void> {
	const fullReportText = formatRunReport(input);

	try {
		await sendTelegramMessage(
			{
				botToken,
				chatId,
				...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
			},
			fullReportText,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown error";
		console.error(`Failed to notify run in Telegram: ${message}`);

		console.error("=========== BEGIN FULL REPORT TEXT ============");
		console.error(fullReportText);
		console.error("=========== END FULL REPORT TEXT ============");
	}
}

/** Send a failure alert when the run throws before a report can be built. */
export async function notifyRunFailure(
	telegram: TelegramConfig,
	message: string,
	options: NotifyOptions = {},
): Promise<void> {
	if (!telegram.chatId) {
		return;
	}

	await sendTelegramMessage(
		{
			botToken: telegram.botToken,
			chatId: telegram.chatId,
			...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
		},
		formatRunFailure(message),
	);
}
