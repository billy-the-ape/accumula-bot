import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import { buildPortfolioSummaryInput } from "@/notifications/telegram/buildPortfolioSummaryInput.js";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
import {
	createPortfolio,
	findPortfolioById,
} from "@/storage/repositories/portfolioRepository.js";
import { recordTrade } from "@/storage/repositories/tradeRepository.js";

const config = loadTestConfig();

describe("buildPortfolioSummaryInput", () => {
	let client: Client | undefined;
	let db: AppDatabase | undefined;

	const marketSnapshots = [
		{
			asset: "LINK",
			priceUsd: 21,
			change24hPct: 0,
			change7dPct: 0,
			change30dPct: 0,
			volumeTrend: "flat" as const,
			marketCapUsd: 1,
		},
		{
			asset: "BTC",
			priceUsd: 100_000,
			change24hPct: 0,
			change7dPct: 0,
			change30dPct: 0,
			volumeTrend: "flat" as const,
			marketCapUsd: 1,
		},
	];

	afterEach(() => {
		client?.close();
		client = undefined;
		db = undefined;
	});

	it("computes all-time position P&L from trade history", async () => {
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

		await recordTrade(db, {
			portfolioId: portfolio.id,
			side: "buy",
			symbol: "LINK",
			quantity: 1,
			priceUsd: 20,
			quoteValueUsd: 20,
		});

		const loaded = await findPortfolioById(db, portfolio.id);
		if (!loaded) {
			throw new Error("Portfolio not found");
		}

		const summary = await buildPortfolioSummaryInput(config, loaded, {
			db,
			marketSnapshots,
		});

		expect(summary.assetPerformances).toEqual([
			{ symbol: "LINK", usdValue: 21, returnPct: 5 },
		]);
	});
});
