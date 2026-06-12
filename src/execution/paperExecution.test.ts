import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "@/config/loadConfig.js";
import {
	createPaperExecutionConfig,
	PaperExecution,
} from "@/execution/paperExecution.js";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
import { findPortfolioById } from "@/storage/repositories/portfolioRepository.js";

const marketSnapshots = [
	{
		asset: "BTC",
		priceUsd: 100_000,
		change24hPct: 1,
		change7dPct: 2,
		change30dPct: 3,
		volumeTrend: "flat" as const,
		marketCapUsd: 1_000_000,
	},
	{
		asset: "ETH",
		priceUsd: 3_000,
		change24hPct: 1,
		change7dPct: 2,
		change30dPct: 3,
		volumeTrend: "flat" as const,
		marketCapUsd: 500_000,
	},
	{
		asset: "SOL",
		priceUsd: 150,
		change24hPct: 1,
		change7dPct: 2,
		change30dPct: 3,
		volumeTrend: "flat" as const,
		marketCapUsd: 100_000,
	},
];

describe("PaperExecution", () => {
	let client: Client | undefined;
	let db: AppDatabase | undefined;

	afterEach(() => {
		client?.close();
		client = undefined;
		db = undefined;
	});

	it("executes defensive cash rotation with settled cash legs", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const appConfig = loadConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const execution = new PaperExecution(
			db,
			createPaperExecutionConfig(appConfig, { initialCashUsd: 10_000 }),
		);

		await execution.executeRecommendation({
			recommendation: {
				rankings: [{ asset: "SOL", score: 0.4 }],
				recommended_asset: "SOL",
				confidence: 0.7,
				reason: "Warm up portfolio",
			},
			marketSnapshots,
		});

		const defensive = await execution.executeRecommendation({
			recommendation: {
				rankings: [{ asset: "SOL", score: 0.3 }],
				recommended_asset: "USDC",
				confidence: 0.8,
				reason: "Risk off",
			},
			marketSnapshots,
		});

		expect(defensive.executed).toBe(true);
		expect(defensive.trades.length).toBeGreaterThan(0);

		const portfolio = await findPortfolioById(db, 1);
		expect(portfolio?.holdings).toEqual({ USDC: 10_000 });
	});

	it("executes rotation into the recommended asset", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const appConfig = loadConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const execution = new PaperExecution(
			db,
			createPaperExecutionConfig(appConfig, { initialCashUsd: 10_000 }),
		);

		const result = await execution.executeRecommendation({
			recommendation: {
				rankings: [{ asset: "ETH", score: 0.8 }],
				recommended_asset: "ETH",
				confidence: 0.75,
				reason: "ETH strength",
			},
			marketSnapshots,
		});

		expect(result.executed).toBe(true);

		const portfolio = await findPortfolioById(db, 1);
		expect(portfolio?.holdings.USDC).toBeCloseTo(7_500, 5);
		expect(portfolio?.holdings.ETH).toBeCloseTo(2500 / 3_000, 5);
	});

	it("holds when the portfolio is already aligned", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const appConfig = loadConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const execution = new PaperExecution(
			db,
			createPaperExecutionConfig(appConfig, { initialCashUsd: 10_000 }),
		);

		const result = await execution.executeRecommendation({
			recommendation: {
				rankings: [{ asset: "BTC", score: 0.5 }],
				recommended_asset: "USDC",
				confidence: 0.6,
				reason: "Stay in cash",
			},
			marketSnapshots,
		});

		expect(result.executed).toBe(false);
		expect(result.reason).toMatch(/already aligned/i);
	});
});
