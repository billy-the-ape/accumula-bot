import type { AppConfig } from "@/config/appConfigSchema.js";
import { completeLiveDeposit } from "@/live/completeLiveDeposit.js";
import {
	isLiveDepositWindowOpen,
	LIVE_DEPOSIT_POLL_INTERVAL_MS,
} from "@/live/liveDepositWindow.js";
import { syncLivePortfolioDeposit } from "@/live/syncLiveDeposit.js";
import {
	formatLiveDepositExpiredMessage,
	formatLiveDepositSuccessMessage,
	formatLiveDepositUnderMinimumMessage,
} from "@/notifications/telegram/bot/onboardingMessages.js";
import type { BuildPortfolioSummaryInputOptions } from "@/notifications/telegram/buildPortfolioSummaryInput.js";
import { sendBotReply } from "@/notifications/telegram/telegramPolling.js";
import type { AppDatabase } from "@/storage/db.js";
import {
	findPortfolioById,
	listPendingLiveDepositPortfolios,
	revertLivePortfolioAwaitingDeposit,
} from "@/storage/repositories/portfolioRepository.js";
import { updateTelegramUserOnboarding } from "@/storage/repositories/telegramUserRepository.js";

export type LiveDepositPollerDeps = BuildPortfolioSummaryInputOptions & {
	sendReply?: typeof sendBotReply;
};

export type StartLiveDepositPollingInput = LiveDepositPollerDeps & {
	db: AppDatabase;
	config: AppConfig;
	portfolioId: number;
	telegramUserId: number;
	chatId: string;
};

type PollOutcome = "pending" | "funded" | "expired";

const activePollers = new Map<number, AbortController>();
const underMinimumNotified = new Set<number>();

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(new DOMException("Aborted", "AbortError"));
			},
			{ once: true },
		);
	});
}

export function stopLiveDepositPolling(portfolioId: number): void {
	activePollers.get(portfolioId)?.abort();
	activePollers.delete(portfolioId);
	underMinimumNotified.delete(portfolioId);
}

export function startLiveDepositPolling(
	input: StartLiveDepositPollingInput,
): void {
	stopLiveDepositPolling(input.portfolioId);
	const controller = new AbortController();
	activePollers.set(input.portfolioId, controller);

	void runLiveDepositPollingLoop(input, controller.signal).finally(() => {
		if (activePollers.get(input.portfolioId) === controller) {
			activePollers.delete(input.portfolioId);
		}
	});
}

async function notifyUser(
	input: StartLiveDepositPollingInput,
	text: string,
): Promise<void> {
	const botToken = input.config.telegram?.botToken;
	if (!botToken) {
		return;
	}

	const sendReply = input.sendReply ?? sendBotReply;
	await sendReply({
		botToken,
		chatId: input.chatId,
		text,
		...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
	});
}

async function revertExpiredDeposit(
	input: StartLiveDepositPollingInput,
): Promise<void> {
	await revertLivePortfolioAwaitingDeposit(input.db, input.portfolioId);
	await updateTelegramUserOnboarding(input.db, input.telegramUserId, {
		onboardingState: null,
		onboardingDraftJson: null,
	});
	await notifyUser(input, formatLiveDepositExpiredMessage());
}

export async function runLiveDepositPollCycle(
	input: StartLiveDepositPollingInput,
): Promise<PollOutcome> {
	const portfolio = await findPortfolioById(input.db, input.portfolioId);
	if (!portfolio?.isActive || portfolio.fundingStatus !== "awaiting_deposit") {
		return "funded";
	}

	if (!isLiveDepositWindowOpen(portfolio.createdAt)) {
		await revertExpiredDeposit(input);
		return "expired";
	}

	const syncResult = await syncLivePortfolioDeposit(
		input.db,
		input.config,
		input.portfolioId,
		...(input.fetchImpl ? [{ fetchImpl: input.fetchImpl }] : []),
	);

	if (!syncResult) {
		return "pending";
	}

	if (syncResult.depositStatus === "under_minimum") {
		if (!underMinimumNotified.has(input.portfolioId)) {
			underMinimumNotified.add(input.portfolioId);
			await notifyUser(
				input,
				formatLiveDepositUnderMinimumMessage(
					syncResult.onChainUsdc,
					portfolio.minDepositUsd ?? input.config.live.minDepositUsd,
				),
			);
		}
		return "pending";
	}

	if (syncResult.depositStatus === "funded") {
		await completeLiveDeposit(
			input.db,
			input.config,
			syncResult.portfolio,
			syncResult.onChainUsdc,
			input.telegramUserId,
			{
				...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
				...(input.fetchMarketSnapshotsImpl
					? { fetchMarketSnapshotsImpl: input.fetchMarketSnapshotsImpl }
					: {}),
			},
		);
		await notifyUser(
			input,
			formatLiveDepositSuccessMessage(syncResult.onChainUsdc),
		);
		underMinimumNotified.delete(input.portfolioId);
		return "funded";
	}

	return "pending";
}

async function runLiveDepositPollingLoop(
	input: StartLiveDepositPollingInput,
	signal: AbortSignal,
): Promise<void> {
	while (!signal.aborted) {
		const outcome = await runLiveDepositPollCycle(input);
		if (outcome === "funded" || outcome === "expired") {
			stopLiveDepositPolling(input.portfolioId);
			return;
		}

		try {
			await sleep(LIVE_DEPOSIT_POLL_INTERVAL_MS, signal);
		} catch {
			return;
		}
	}
}

export async function resumePendingLiveDepositPolls(
	db: AppDatabase,
	config: AppConfig,
	deps: LiveDepositPollerDeps = {},
): Promise<void> {
	const pending = await listPendingLiveDepositPortfolios(db);
	for (const portfolio of pending) {
		if (!isLiveDepositWindowOpen(portfolio.createdAt)) {
			await revertLivePortfolioAwaitingDeposit(db, portfolio.id);
			if (portfolio.telegramUserId !== null) {
				await updateTelegramUserOnboarding(db, portfolio.telegramUserId, {
					onboardingState: null,
					onboardingDraftJson: null,
				});
			}
			continue;
		}

		if (portfolio.telegramUserId === null) {
			continue;
		}

		startLiveDepositPolling({
			db,
			config,
			portfolioId: portfolio.id,
			telegramUserId: portfolio.telegramUserId,
			chatId: portfolio.telegramChatId,
			...deps,
		});
	}
}

/** For tests — clears in-memory poller state. */
export function resetLiveDepositPollingState(): void {
	for (const controller of activePollers.values()) {
		controller.abort();
	}
	activePollers.clear();
	underMinimumNotified.clear();
}
