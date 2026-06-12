import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
import {
	createPortfolio,
	findPortfolioById,
	getLatestPortfolio,
	getOrCreatePortfolio,
	getPortfolioHoldings,
	setPortfolioTradingEnabled,
	updatePortfolioBaselines,
} from "@/storage/repositories/portfolioRepository.js";

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
		});

		const reused = await getOrCreatePortfolio(db, {
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 99_999 },
			initialBtcBaseline: 1,
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
		});

		expect(await getPortfolioHoldings(db, portfolio.id)).toEqual({
			USDC: 1_000,
			BTC: 0.01,
		});
	});
});
