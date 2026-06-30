import type { TelegramConfig } from "@/config/appConfigSchema.js";
import { formatCompactTradeReport } from "@/notifications/telegram/formatCompactTradeReport.js";
import {
	formatRunFailure,
	formatRunReport,
	type RunReportInput,
} from "@/notifications/telegram/formatRunReport.js";
import { sendTelegramMessage } from "@/notifications/telegram/telegramClient.js";
import type { StoredTrade } from "@/schemas/Trade.js";

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

/** Send a compact trade-only report when verbose mode is off. */
export async function notifyCompactTrades(
	botToken: string,
	chatId: string,
	trades: readonly StoredTrade[],
	options: NotifyOptions = {},
): Promise<void> {
	const text = formatCompactTradeReport(trades);
	if (!text) {
		return;
	}

	try {
		await sendTelegramMessage(
			{
				botToken,
				chatId,
				...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
			},
			text,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown error";
		console.error(`Failed to notify compact trades in Telegram: ${message}`);
		console.error("=========== BEGIN COMPACT TRADE TEXT ============");
		console.error(text);
		console.error("=========== END COMPACT TRADE TEXT ============");
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
