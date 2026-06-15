import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
import { saveDecision } from "@/storage/repositories/decisionRepository.js";
import {
	createPortfolio,
	findPortfolioById,
} from "@/storage/repositories/portfolioRepository.js";
import {
	findTradeById,
	listTradesForPortfolio,
	recordTrade,
} from "@/storage/repositories/tradeRepository.js";

describe("tradeRepository", () => {
	let client: Client | undefined;
	let db: AppDatabase | undefined;

	afterEach(() => {
		client?.close();
		client = undefined;
		db = undefined;
	});

	async function createTestPortfolio(connection: AppDatabase) {
		return createPortfolio(connection, {
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 10_000 },
			initialBtcBaseline: 0.1,
			initialQuoteBaseline: 10_000,
		});
	}

	it("records a buy trade and updates holdings", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const portfolio = await createTestPortfolio(db);

		const trade = await recordTrade(db, {
			portfolioId: portfolio.id,
			side: "buy",
			symbol: "SOL",
			quantity: 10,
			priceUsd: 150,
			quoteValueUsd: 1_500,
		});

		expect(trade.side).toBe("buy");
		expect(trade.symbol).toBe("SOL");

		const loaded = await findPortfolioById(db, portfolio.id);
		if (!loaded) {
			throw new Error("Portfolio not found");
		}
		expect(loaded.holdings).toEqual({ USDC: 10_000, SOL: 10 });
	});

	it("records a sell trade and removes empty positions", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const portfolio = await createPortfolio(db, {
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 10_000, SOL: 10 },
			initialBtcBaseline: 0.1,
			initialQuoteBaseline: 10_000,
		});

		const trade = await recordTrade(db, {
			portfolioId: portfolio.id,
			side: "sell",
			symbol: "SOL",
			quantity: 10,
			priceUsd: 150,
			quoteValueUsd: 1_500,
		});

		expect(trade.side).toBe("sell");

		const loaded = await findPortfolioById(db, portfolio.id);
		if (!loaded) {
			throw new Error("Portfolio not found");
		}
		expect(loaded.holdings).toEqual({ USDC: 10_000 });
	});

	it("rejects sells that exceed available quantity", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const portfolio = await createTestPortfolio(db);

		await expect(
			recordTrade(db, {
				portfolioId: portfolio.id,
				side: "sell",
				symbol: "SOL",
				quantity: 1,
				priceUsd: 150,
				quoteValueUsd: 150,
			}),
		).rejects.toThrow(/Insufficient SOL balance/);
	});

	it("lists trades newest first", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const portfolio = await createTestPortfolio(db);

		await recordTrade(db, {
			portfolioId: portfolio.id,
			side: "buy",
			symbol: "ETH",
			quantity: 1,
			priceUsd: 3_000,
			quoteValueUsd: 3_000,
		});

		const decision = await saveDecision(db, {
			assetToAccumulate: "BTC",
			recommendation: {
				outlooks: [
					{
						asset: "SOL",
						direction_score: 8,
						confidence: 0.8,
						reason: "SOL momentum",
					},
					{
						asset: "BTC",
						direction_score: 5,
						confidence: 0.6,
						reason: "Stable",
					},
					{
						asset: "ETH",
						direction_score: 4,
						confidence: 0.6,
						reason: "Flat",
					},
				],
				summary: "Buy SOL",
			},
			marketSnapshots: [],
			llm: { provider: "openai_compatible", model: "qwen3:8b" },
		});

		const latest = await recordTrade(db, {
			portfolioId: portfolio.id,
			side: "buy",
			symbol: "SOL",
			quantity: 5,
			priceUsd: 150,
			quoteValueUsd: 750,
			decisionId: decision.id,
		});

		const trades = await listTradesForPortfolio(db, portfolio.id);
		expect(trades).toHaveLength(2);
		expect(trades[0]?.id).toBe(latest.id);
		expect(trades[0]?.decisionId).toBe(decision.id);

		const loaded = await findTradeById(db, latest.id);
		expect(loaded?.symbol).toBe("SOL");
	});
});
