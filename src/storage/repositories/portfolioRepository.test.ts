import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { BASE_CHAIN_ID } from "@/config/baseChain.js";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
import {
	createLivePortfolioAwaitingDeposit,
	createPortfolio,
	finalizeLivePortfolioRisk,
	findPortfolioById,
	getLatestPortfolio,
	getOrCreatePortfolio,
	getPortfolioHoldings,
	listActivePortfolios,
	markLivePortfolioFunded,
	setPortfolioTradingEnabled,
	updatePortfolioBaselines,
} from "@/storage/repositories/portfolioRepository.js";
import { getOrCreateTelegramUser } from "@/storage/repositories/telegramUserRepository.js";

describe("portfolioRepository", () => {
	let client: Client | undefined;
	let db: AppDatabase | undefined;

	afterEach(() => {
		client?.close();
		client = undefined;
		db = undefined;
	});

	it("creates a portfolio with initial holdings", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const portfolio = await createPortfolio(db, {
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 10_000 },
			initialBtcBaseline: 0.1,
			initialQuoteBaseline: 10_000,
		});

		expect(portfolio.id).toBeGreaterThan(0);
		expect(portfolio.holdings).toEqual({ USDC: 10_000 });
		expect(portfolio.dailyBaselineBtcValue).toBe(0.1);
		expect(portfolio.tradingEnabled).toBe(true);

		const loaded = await findPortfolioById(db, portfolio.id);
		expect(loaded?.holdings).toEqual({ USDC: 10_000 });
	});

	it("returns the latest portfolio from getOrCreatePortfolio", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const created = await createPortfolio(db, {
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 5_000 },
			initialBtcBaseline: 0.05,
			initialQuoteBaseline: 5_000,
		});

		const reused = await getOrCreatePortfolio(db, {
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 99_999 },
			initialBtcBaseline: 1,
			initialQuoteBaseline: 99_999,
		});

		expect(reused.id).toBe(created.id);
		expect(reused.holdings).toEqual({ USDC: 5_000 });
		expect(await getLatestPortfolio(db)).toEqual(reused);
	});

	it("updates baselines and trading enabled flag", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const portfolio = await createPortfolio(db, {
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 10_000 },
			initialBtcBaseline: 0.1,
			initialQuoteBaseline: 10_000,
		});

		const updatedBaselines = await updatePortfolioBaselines(db, portfolio.id, {
			dailyBaselineBtcValue: 0.11,
			weeklyBaselineBtcValue: 0.12,
		});
		expect(updatedBaselines.dailyBaselineBtcValue).toBe(0.11);
		expect(updatedBaselines.weeklyBaselineBtcValue).toBe(0.12);

		const disabled = await setPortfolioTradingEnabled(db, portfolio.id, false);
		expect(disabled.tradingEnabled).toBe(false);
	});

	it("loads holdings via getPortfolioHoldings", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const portfolio = await createPortfolio(db, {
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 1_000, BTC: 0.01 },
			initialBtcBaseline: 0.02,
			initialQuoteBaseline: 1_000,
		});

		expect(await getPortfolioHoldings(db, portfolio.id)).toEqual({
			USDC: 1_000,
			BTC: 0.01,
		});
	});

	it("creates live portfolio awaiting deposit and excludes it from active trading list", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const user = await getOrCreateTelegramUser(db, "live-trader");
		const portfolio = await createLivePortfolioAwaitingDeposit(db, {
			telegramUserId: user.id,
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			walletAddress: "0xabc",
			walletKind: "smart_account",
			encryptedPrivateKey: "enc",
			chainId: BASE_CHAIN_ID,
			minDepositUsd: 1000,
		});

		expect(portfolio.walletKind).toBe("smart_account");

		expect(portfolio.mode).toBe("live");
		expect(portfolio.fundingStatus).toBe("awaiting_deposit");
		expect(portfolio.tradingEnabled).toBe(false);
		expect(await listActivePortfolios(db)).toHaveLength(0);

		const funded = await markLivePortfolioFunded(db, {
			portfolioId: portfolio.id,
			depositUsd: 1500,
			cashSymbol: "USDC",
			assetToAccumulate: "BTC",
			chainId: BASE_CHAIN_ID,
		});
		expect(funded.holdings).toEqual({ USDC: 1500 });
		expect(await listActivePortfolios(db)).toHaveLength(0);

		await finalizeLivePortfolioRisk(db, portfolio.id, "medium", 0.015);
		const active = await listActivePortfolios(db);
		expect(active).toHaveLength(1);
		expect(active[0]?.id).toBe(portfolio.id);
		expect(active[0]?.tradingEnabled).toBe(true);
	});
});
