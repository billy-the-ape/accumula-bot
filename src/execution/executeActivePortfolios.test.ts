import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import { executeActivePortfolios } from "@/execution/executeActivePortfolios.js";
import { MIN_CONFIDENCE_BY_RISK_TOLERANCE } from "@/risk/riskTolerance.js";
import type { TradeRecommendation } from "@/schemas/TradeRecommendation.js";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
import { saveDecision } from "@/storage/repositories/decisionRepository.js";
import { createUserPortfolio } from "@/storage/repositories/portfolioRepository.js";
import { getOrCreateTelegramUser } from "@/storage/repositories/telegramUserRepository.js";

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

function recommendation(): TradeRecommendation {
	return {
		outlooks: [
			{ asset: "BTC", direction_score: 5, confidence: 0.7, reason: "Neutral" },
			{
				asset: "ETH",
				direction_score: 8,
				confidence: 0.7,
				reason: "Bullish",
			},
			{ asset: "SOL", direction_score: 5, confidence: 0.7, reason: "Neutral" },
		],
		summary: "Test",
	};
}

describe("executeActivePortfolios", () => {
	let client: Client | undefined;
	let db: AppDatabase | undefined;

	afterEach(() => {
		client?.close();
		client = undefined;
		db = undefined;
	});

	it("returns empty results when no active portfolios exist", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});

		const results = await executeActivePortfolios(db, config, {
			recommendation: recommendation(),
			marketSnapshots,
			decisionId: 999,
		});

		expect(results).toEqual([]);
	});

	it("executes each active user portfolio with its own risk thresholds", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});

		const userA = await getOrCreateTelegramUser(db, "111");
		const userB = await getOrCreateTelegramUser(db, "222");

		await createUserPortfolio(db, {
			telegramUserId: userA.id,
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 10_000 },
			initialBtcBaseline: 0.1,
			initialQuoteBaseline: 10_000,
			riskTolerance: "high",
		});
		await createUserPortfolio(db, {
			telegramUserId: userB.id,
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 10_000 },
			initialBtcBaseline: 0.1,
			initialQuoteBaseline: 10_000,
			riskTolerance: "low",
		});

		const decision = await saveDecision(db, {
			assetToAccumulate: "BTC",
			recommendation: recommendation(),
			marketSnapshots,
			llm: { provider: "openai_compatible", model: "qwen3:8b" },
		});

		const results = await executeActivePortfolios(db, config, {
			recommendation: recommendation(),
			marketSnapshots,
			decisionId: decision.id,
		});

		expect(results).toHaveLength(2);
		expect(
			results.map((result) => result.portfolio.telegramChatId).sort(),
		).toEqual(["111", "222"]);

		const highRisk = results.find(
			(result) => result.portfolio.telegramChatId === "111",
		);
		const lowRisk = results.find(
			(result) => result.portfolio.telegramChatId === "222",
		);

		expect(highRisk?.effectiveOutlookThresholds.minConfidence).toBe(
			MIN_CONFIDENCE_BY_RISK_TOLERANCE.high,
		);
		expect(lowRisk?.effectiveOutlookThresholds.minConfidence).toBe(
			MIN_CONFIDENCE_BY_RISK_TOLERANCE.low,
		);
		expect(highRisk?.execution.executed).toBe(true);
		expect(lowRisk?.execution.executed).toBe(false);
	});
});
