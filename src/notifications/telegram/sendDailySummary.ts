import type { AppConfig } from "@/config/appConfigSchema.js";
import { formatDailySummary } from "@/notifications/telegram/formatDailySummary.js";
import { getCurrentPortfolioData } from "@/notifications/telegram/getCurrentPorfolioData";
import { sendTelegramMessage } from "@/notifications/telegram/telegramClient.js";
import type { AppDatabase } from "@/storage/db.js";

export async function sendDailySummary(
	config: AppConfig,
	db: AppDatabase,
	options: { fetchImpl?: typeof fetch } = {},
): Promise<void> {
	if (!config.telegram) {
		throw new Error("Telegram is not configured");
	}

	const {
		portfolio,
		tradesLast24h,
		btcValue,
		usdValue,
		dailyReturnPct,
		weeklyReturnPct,
		allTimeReturnPct,
	} = await getCurrentPortfolioData(config, db, options);

	const text = formatDailySummary({
		tradesLast24h,
		btcValue,
		usdValue,
		startingBtcValue: portfolio.initialBtcBaseline,
		startingUsdValue: portfolio.initialQuoteBaseline,
		accumulateSymbol: config.assetToAccumulate.symbol,
		dailyReturnPct,
		weeklyReturnPct,
		allTimeReturnPct,
		holdings: portfolio.holdings,
	});

	await sendTelegramMessage(
		{
			botToken: config.telegram.botToken,
			chatId: config.telegram.chatId,
			...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
		},
		text,
	);
}
