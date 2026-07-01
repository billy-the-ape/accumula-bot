import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BASE_CHAIN_ID } from "@/config/baseChain.js";
import { loadConfig } from "@/config/loadConfig.js";
import { syncLivePortfolioDeposit } from "@/live/syncLiveDeposit.js";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
import {
	createLivePortfolioAwaitingDeposit,
	findPortfolioById,
} from "@/storage/repositories/portfolioRepository.js";
import { getOrCreateTelegramUser } from "@/storage/repositories/telegramUserRepository.js";

const validEnv = {
	CLOUDAMQP_URL: "amqp://localhost",
	ASSET_TO_ACCUMULATE: "btc",
	ASSET_TRADEABLE: "BTC, ETH, SOL, USDC",
	ASSET_STARTING: "USDC",
	LLM_BASE_URL: "http://127.0.0.1:11434",
	LLM_MODEL: "qwen3:8b",
	WALLET_ENCRYPTION_KEY: "a".repeat(64),
};

describe("syncLivePortfolioDeposit", () => {
	let client: Client | undefined;
	let db: AppDatabase | undefined;
	const config = loadConfig(validEnv);

	afterEach(() => {
		client?.close();
		client = undefined;
		db = undefined;
	});

	async function createAwaitingPortfolio() {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;
		const user = await getOrCreateTelegramUser(db, "live-user");
		const portfolio = await createLivePortfolioAwaitingDeposit(db, {
			telegramUserId: user.id,
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			walletAddress: "0x0000000000000000000000000000000000000001",
			encryptedPrivateKey: "encrypted",
			chainId: BASE_CHAIN_ID,
			minDepositUsd: 1000,
		});
		return { db, portfolio };
	}

	it("marks portfolio funded when on-chain balance meets minimum", async () => {
		const { db: database, portfolio } = await createAwaitingPortfolio();
		const fetchImpl = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				result:
					"0x000000000000000000000000000000000000000000000000000000003b9aca00",
			}),
		})) as unknown as typeof fetch;

		const result = await syncLivePortfolioDeposit(
			database,
			config,
			portfolio.id,
			{ fetchImpl },
		);

		expect(result?.funded).toBe(true);
		expect(result?.depositStatus).toBe("funded");
		expect(result?.onChainUsdc).toBe(1000);
		const updated = await findPortfolioById(database, portfolio.id);
		expect(updated?.fundingStatus).toBe("funded");
		expect(updated?.holdings).toEqual({ USDC: 1000 });
		expect(updated?.initialQuoteBaseline).toBe(1000);
	});

	it("returns unfunded when balance is below minimum", async () => {
		const { db: database, portfolio } = await createAwaitingPortfolio();
		const fetchImpl = vi.fn(async () => ({
			ok: true,
			json: async () => ({ result: "0x" }),
		})) as unknown as typeof fetch;

		const result = await syncLivePortfolioDeposit(
			database,
			config,
			portfolio.id,
			{ fetchImpl },
		);

		expect(result?.funded).toBe(false);
		expect(result?.depositStatus).toBe("none");
		expect(result?.onChainUsdc).toBe(0);
		const updated = await findPortfolioById(database, portfolio.id);
		expect(updated?.fundingStatus).toBe("awaiting_deposit");
	});

	it("returns under_minimum when balance is positive but below minimum", async () => {
		const { db: database, portfolio } = await createAwaitingPortfolio();
		const fetchImpl = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				result:
					"0x00000000000000000000000000000000000000000000000000000000005f5e100",
			}),
		})) as unknown as typeof fetch;

		const result = await syncLivePortfolioDeposit(
			database,
			config,
			portfolio.id,
			{ fetchImpl },
		);

		expect(result?.depositStatus).toBe("under_minimum");
		expect(result?.onChainUsdc).toBe(100);
		expect(result?.funded).toBe(false);
	});
});
