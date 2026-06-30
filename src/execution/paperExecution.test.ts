import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import {
	computeBuyScore,
	purchaseFractionFromScore,
} from "@/execution/buySizing.js";
import {
	createPaperExecutionConfig,
	PaperExecution,
} from "@/execution/paperExecution.js";
import { DEFAULT_RISK_LIMITS } from "@/risk/riskLimits.js";
import { resolveOutlookThresholds } from "@/risk/riskTolerance.js";
import type { TradeRecommendation } from "@/schemas/TradeRecommendation.js";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
import {
	createPortfolio,
	findPortfolioById,
	type StoredPortfolio,
} from "@/storage/repositories/portfolioRepository.js";

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

function outlookRecommendation(
	overrides: Partial<TradeRecommendation["outlooks"][number]>[],
): TradeRecommendation {
	return {
		outlooks: overrides.map((outlook, index) => ({
			asset: outlook.asset ?? ["BTC", "ETH", "SOL"][index] ?? "BTC",
			direction_score: outlook.direction_score ?? 5,
			confidence: outlook.confidence ?? 0.7,
			reason: outlook.reason ?? "Test outlook",
		})),
		summary: "Test recommendation",
	};
}

async function seedPortfolio(
	db: AppDatabase,
	cashUsd = 10_000,
): Promise<StoredPortfolio> {
	return createPortfolio(db, {
		assetToAccumulate: "BTC",
		cashSymbol: "USDC",
		initialHoldings: { USDC: cashUsd },
		initialBtcBaseline: cashUsd / 100_000,
		initialQuoteBaseline: cashUsd,
	});
}

describe("PaperExecution", () => {
	let client: Client | undefined;
	let db: AppDatabase | undefined;

	afterEach(() => {
		client?.close();
		client = undefined;
		db = undefined;
	});

	it("returns hold when no portfolio is provided", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const appConfig = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const execution = new PaperExecution(
			db,
			createPaperExecutionConfig(appConfig),
		);

		const result = await execution.executeRecommendation({
			recommendation: outlookRecommendation([
				{ asset: "BTC", direction_score: 5 },
				{ asset: "ETH", direction_score: 8, confidence: 0.8 },
				{ asset: "SOL", direction_score: 5 },
			]),
			marketSnapshots,
		});

		expect(result.executed).toBe(false);
		expect(result.reason).toBe("No portfolio provided");
	});

	it("executes bearish sells for held assets", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const appConfig = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const execution = new PaperExecution(
			db,
			createPaperExecutionConfig(appConfig),
		);
		const portfolio = await seedPortfolio(db);

		await execution.executeForPortfolio(portfolio, {
			recommendation: outlookRecommendation([
				{ asset: "BTC", direction_score: 5 },
				{ asset: "ETH", direction_score: 8, confidence: 0.8 },
				{ asset: "SOL", direction_score: 5 },
			]),
			marketSnapshots,
		});

		const defensive = await execution.executeForPortfolio(
			await findPortfolioById(db, portfolio.id).then(
				(p) => p as StoredPortfolio,
			),
			{
				recommendation: outlookRecommendation([
					{ asset: "BTC", direction_score: 5 },
					{ asset: "ETH", direction_score: 2, confidence: 0.8 },
					{ asset: "SOL", direction_score: 5 },
				]),
				marketSnapshots,
			},
		);

		expect(defensive.executed).toBe(true);
		expect(defensive.trades.length).toBeGreaterThan(0);

		const updated = await findPortfolioById(db, portfolio.id);
		expect(updated?.holdings.ETH).toBeUndefined();
		expect(updated?.holdings.USDC).toBeCloseTo(10_000, 5);
	});

	it("executes a bullish buy from cash", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const appConfig = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const execution = new PaperExecution(
			db,
			createPaperExecutionConfig(appConfig),
		);
		const portfolio = await seedPortfolio(db);

		const result = await execution.executeForPortfolio(portfolio, {
			recommendation: outlookRecommendation([
				{ asset: "BTC", direction_score: 5 },
				{ asset: "ETH", direction_score: 8, confidence: 0.75 },
				{ asset: "SOL", direction_score: 5 },
			]),
			marketSnapshots,
		});

		expect(result.executed).toBe(true);

		const thresholds = resolveOutlookThresholds(
			appConfig.outlookThresholds,
			portfolio.riskTolerance,
		);
		const ethOutlook = {
			asset: "ETH",
			direction_score: 8,
			confidence: 0.75,
		};
		const buyScore = computeBuyScore(ethOutlook, thresholds);
		const purchaseFraction = purchaseFractionFromScore(
			buyScore,
			DEFAULT_RISK_LIMITS,
		);
		const buyValue = 10_000 * purchaseFraction;

		const updated = await findPortfolioById(db, portfolio.id);
		expect(updated?.holdings.USDC).toBeCloseTo(10_000 - buyValue, 5);
		expect(updated?.holdings.ETH).toBeCloseTo(buyValue / 3_000, 5);
	});

	it("holds when outlooks do not trigger trades", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const appConfig = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const execution = new PaperExecution(
			db,
			createPaperExecutionConfig(appConfig),
		);
		const portfolio = await seedPortfolio(db);

		const result = await execution.executeForPortfolio(portfolio, {
			recommendation: outlookRecommendation([
				{ asset: "BTC", direction_score: 5 },
				{ asset: "ETH", direction_score: 5 },
				{ asset: "SOL", direction_score: 5 },
			]),
			marketSnapshots,
		});

		expect(result.executed).toBe(false);
		expect(result.reason).toMatch(/no outlook-driven trades/i);
	});

	it("applies per-portfolio risk tolerance thresholds", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const appConfig = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});
		const execution = new PaperExecution(
			db,
			createPaperExecutionConfig(appConfig),
		);

		const lowRisk = await createPortfolio(db, {
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 10_000 },
			initialBtcBaseline: 0.1,
			initialQuoteBaseline: 10_000,
			riskTolerance: "low",
		});

		const result = await execution.executeForPortfolio(lowRisk, {
			recommendation: outlookRecommendation([
				{ asset: "BTC", direction_score: 5 },
				{ asset: "ETH", direction_score: 8, confidence: 0.7 },
				{ asset: "SOL", direction_score: 5 },
			]),
			marketSnapshots,
		});

		expect(result.executed).toBe(false);
		expect(result.reason).toMatch(/no outlook-driven trades/i);
	});
});
