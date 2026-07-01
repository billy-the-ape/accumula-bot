import type { Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_CHAIN_ID } from "@/config/baseChain.js";
import { loadConfig } from "@/config/loadConfig.js";
import {
	resetLiveDepositPollingState,
	runLiveDepositPollCycle,
} from "@/live/liveDepositPoller.js";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
import {
	createLivePortfolioAwaitingDeposit,
	findPortfolioById,
} from "@/storage/repositories/portfolioRepository.js";
import {
	findTelegramUserByChatId,
	getOrCreateTelegramUser,
} from "@/storage/repositories/telegramUserRepository.js";

const validEnv = {
	CLOUDAMQP_URL: "amqp://localhost",
	ASSET_TO_ACCUMULATE: "btc",
	ASSET_TRADEABLE: "BTC, ETH, SOL, USDC",
	ASSET_STARTING: "USDC",
	LLM_BASE_URL: "http://127.0.0.1:11434",
	LLM_MODEL: "qwen3:8b",
	TELEGRAM_BOT_TOKEN: "bot-token",
	WALLET_ENCRYPTION_KEY: "c".repeat(64),
};

describe("liveDepositPoller", () => {
	let client: Client | undefined;
	let db: AppDatabase | undefined;
	const config = loadConfig(validEnv);
	const sendReply = vi.fn().mockResolvedValue(undefined);
	const fetchMarketSnapshotsImpl = vi.fn(async () => [
		{
			asset: "BTC",
			priceUsd: 98_500,
			change24hPct: 0,
			change7dPct: 0,
			change30dPct: 0,
			volumeTrend: "flat" as const,
			marketCapUsd: 1,
		},
		{
			asset: "USDC",
			priceUsd: 1,
			change24hPct: 0,
			change7dPct: 0,
			change30dPct: 0,
			volumeTrend: "flat" as const,
			marketCapUsd: 1,
		},
	]);

	beforeEach(() => {
		sendReply.mockClear();
		fetchMarketSnapshotsImpl.mockClear();
		resetLiveDepositPollingState();
	});

	afterEach(() => {
		resetLiveDepositPollingState();
		client?.close();
		client = undefined;
		db = undefined;
	});

	async function createAwaitingPortfolio() {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;
		const user = await getOrCreateTelegramUser(db, "poller-user");
		const portfolio = await createLivePortfolioAwaitingDeposit(db, {
			telegramUserId: user.id,
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			walletAddress: "0x0000000000000000000000000000000000000001",
			encryptedPrivateKey: "encrypted",
			chainId: BASE_CHAIN_ID,
			minDepositUsd: 1000,
		});
		return { db, portfolio, user };
	}

	it("completes portfolio when qualifying deposit is detected", async () => {
		const { db: database, portfolio, user } = await createAwaitingPortfolio();
		const fetchImpl = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				result:
					"0x000000000000000000000000000000000000000000000000000000003b9aca00",
			}),
		})) as unknown as typeof fetch;

		const outcome = await runLiveDepositPollCycle({
			db: database,
			config,
			portfolioId: portfolio.id,
			telegramUserId: user.id,
			chatId: user.telegramChatId,
			sendReply,
			fetchImpl,
			fetchMarketSnapshotsImpl,
		});

		expect(outcome).toBe("funded");
		const updated = await findPortfolioById(database, portfolio.id);
		expect(updated?.fundingStatus).toBe("funded");
		expect(updated?.tradingEnabled).toBe(true);
		expect(updated?.holdings).toEqual({ USDC: 1000 });
		expect(sendReply).toHaveBeenCalledOnce();

		const refreshedUser = await findTelegramUserByChatId(
			database,
			user.telegramChatId,
		);
		expect(refreshedUser?.onboardingState).toBeNull();
	});
});
