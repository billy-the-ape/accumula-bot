import type { AppConfig } from "@/config/appConfigSchema.js";
import { fetchMarketSnapshotsForConfig } from "@/notifications/telegram/buildPortfolioSummaryInput.js";
import {
	type DailySummaryMacroBriefing,
	formatDailySummary,
} from "@/notifications/telegram/formatDailySummary.js";
import { getCurrentPortfolioData } from "@/notifications/telegram/getCurrentPorfolioData.js";
import { sendTelegramMessage } from "@/notifications/telegram/telegramClient.js";
import type { MarketSnapshot } from "@/schemas/MarketSnapshot.js";
import type { AppDatabase } from "@/storage/db.js";
import { listActivePortfolios } from "@/storage/repositories/portfolioRepository.js";

export type SendDailySummaryOptions = {
	fetchImpl?: typeof fetch;
	macroBriefing?: DailySummaryMacroBriefing;
	marketSnapshots?: readonly MarketSnapshot[];
};

export type SendDailySummaryResult = {
	sentCount: number;
	recipientChatIds: string[];
};

async function sendDailySummaryToChat(
	config: AppConfig,
	chatId: string,
	summaryText: string,
	options: SendDailySummaryOptions,
): Promise<void> {
	if (!config.telegram?.botToken) {
		throw new Error(
			"Telegram bot token is not configured. Set TELEGRAM_BOT_TOKEN in .env",
		);
	}

	await sendTelegramMessage(
		{
			botToken: config.telegram.botToken,
			chatId,
			...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
		},
		summaryText,
	);
}

export async function sendDailySummary(
	config: AppConfig,
	db: AppDatabase,
	options: SendDailySummaryOptions = {},
): Promise<SendDailySummaryResult> {
	if (!config.telegram?.botToken) {
		throw new Error(
			"Telegram bot token is not configured. Set TELEGRAM_BOT_TOKEN in .env",
		);
	}

	const activePortfolios = await listActivePortfolios(db);
	if (activePortfolios.length === 0) {
		return { sentCount: 0, recipientChatIds: [] };
	}

	const marketSnapshots =
		options.marketSnapshots ??
		(await fetchMarketSnapshotsForConfig(config, options));
	const recipientChatIds: string[] = [];
	const adminChatId = config.telegram.chatId;

	for (const activePortfolio of activePortfolios) {
		const {
			portfolio,
			tradesLast24h,
			btcValue,
			usdValue,
			dailyReturnPct,
			weeklyReturnPct,
			allTimeReturnPct,
		} = await getCurrentPortfolioData(config, db, activePortfolio, {
			...options,
			marketSnapshots,
		});

		const text = formatDailySummary({
			tradesLast24h,
			btcValue,
			usdValue,
			startingBtcValue: portfolio.initialBtcBaseline,
			startingUsdValue: portfolio.initialQuoteBaseline,
			accumulateSymbol: portfolio.assetToAccumulate,
			dailyReturnPct,
			weeklyReturnPct,
			allTimeReturnPct,
			holdings: portfolio.holdings,
			userDateTimeSettings: activePortfolio.userDateTimeSettings,
			...(options.macroBriefing
				? { macroBriefing: options.macroBriefing }
				: {}),
		});

		await sendDailySummaryToChat(
			config,
			activePortfolio.telegramChatId,
			text,
			options,
		);
		recipientChatIds.push(activePortfolio.telegramChatId);

		if (adminChatId && adminChatId !== activePortfolio.telegramChatId) {
			await sendDailySummaryToChat(config, adminChatId, text, options);
		}
	}

	return {
		sentCount: recipientChatIds.length,
		recipientChatIds,
	};
}
