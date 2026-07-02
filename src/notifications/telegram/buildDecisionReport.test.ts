import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import type { AnalysisContext } from "@/analysis/types.js";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import { buildDecisionReportForUser } from "@/notifications/telegram/buildDecisionReport.js";
import { code } from "@/notifications/telegram/escapeMarkdownV2";
import { escapeUserDateTimeForMarkdown } from "@/notifications/telegram/formatUserDateTime.js";
import type { PredictionSignal } from "@/schemas/PredictionSignal.js";
import type { ScoredSocialMediaPost } from "@/schemas/ScoredSocialMediaPost.js";
import type { TradeRecommendation } from "@/schemas/TradeRecommendation.js";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
import {
	findDecisionById,
	saveDecision,
} from "@/storage/repositories/decisionRepository.js";
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
];

const recommendation: TradeRecommendation = {
	outlooks: [
		{ asset: "BTC", direction_score: 8, confidence: 0.72, reason: "Strong" },
	],
	summary: "Buy BTC",
};

const sampleScoredPost: ScoredSocialMediaPost = {
	externalId: "111",
	source: "twitter",
	username: "whale_alert",
	text: "Large BTC transfer detected",
	postedAt: "2026-06-16T12:00:00.000Z",
	impressions: 42_000,
	relevanceScore: 9,
	scoredAt: "2026-06-16T12:05:00.000Z",
};

const samplePrediction: PredictionSignal = {
	asset: "BTC",
	source: "polymarket",
	impliedUpProbability: 0.79,
	horizonHours: 24,
	liquidityUsd: 50_000,
	asOf: "2026-06-15T12:00:00.000Z",
	marketRef: "btc-above-100k",
};

function createAnalysisContext(): AnalysisContext {
	return {
		fetchedAt: new Date().toISOString(),
		sections: [
			{
				sourceId: "social_media",
				label: "Social media",
				promptText: "digest",
				payload: {
					signals: [
						{
							index: 0,
							id: "111",
							source: "twitter",
							username: "whale_alert",
							text: "Large BTC transfer detected",
							asOf: "2026-06-16T12:00:00.000Z",
							impressions: 42_000,
						},
					],
					topPostsForReport: [sampleScoredPost],
					scoringStats: {
						fetched: 10,
						newlyScored: 3,
						skippedAlreadyScored: 7,
					},
				},
			},
			{
				sourceId: "prediction_markets",
				label: "Prediction markets",
				promptText: "BTC up 79%",
				payload: [samplePrediction],
			},
		],
	};
}

describe("buildDecisionReportForUser", () => {
	let client: Client | undefined;
	let db: AppDatabase | undefined;

	afterEach(() => {
		client?.close();
		client = undefined;
		db = undefined;
	});

	it("returns undefined when the user has no portfolio", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const user = await getOrCreateTelegramUser(db, "111");
		const config = loadTestConfig({ LLM_BASE_URL: "http://127.0.0.1:11434" });

		const report = await buildDecisionReportForUser(db, config, user.id, {
			kind: "last",
		});

		expect(report).toBeUndefined();
	});

	it("includes the decision id for an accessible decision", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const config = loadTestConfig({ LLM_BASE_URL: "http://127.0.0.1:11434" });
		const user = await getOrCreateTelegramUser(db, "222");
		await createUserPortfolio(db, {
			telegramUserId: user.id,
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 10_000 },
			initialBtcBaseline: 0.1,
			initialQuoteBaseline: 10_000,
			riskTolerance: "medium",
		});

		const saved = await saveDecision(db, {
			assetToAccumulate: "BTC",
			recommendation,
			marketSnapshots,
			llm: { provider: "openai_compatible", model: "qwen3:8b" },
		});

		const report = await buildDecisionReportForUser(db, config, user.id, {
			kind: "id",
			id: saved.id,
		});

		expect(report?.text).toContain(`Decision:`);
		expect(report?.text).toContain(`\\#${code(String(saved.id))}`);
		expect(report?.text).toContain("Time:");
		expect(report?.text).toContain(
			escapeUserDateTimeForMarkdown(saved.createdAt, {
				locale: null,
				timezone: null,
			}),
		);
		expect(report?.text).toContain("Buy BTC");
		expect(report?.decisionId).toBe(saved.id);
	});

	it("replays social and prediction sections when analysisContext was stored", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const config = loadTestConfig({ LLM_BASE_URL: "http://127.0.0.1:11434" });
		const user = await getOrCreateTelegramUser(db, "333");
		await createUserPortfolio(db, {
			telegramUserId: user.id,
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 10_000 },
			initialBtcBaseline: 0.1,
			initialQuoteBaseline: 10_000,
			riskTolerance: "medium",
		});

		const analysisContext = createAnalysisContext();
		const saved = await saveDecision(db, {
			assetToAccumulate: "BTC",
			recommendation,
			marketSnapshots,
			analysisContext,
			llm: { provider: "openai_compatible", model: "qwen3:8b" },
		});

		const loaded = await findDecisionById(db, saved.id);
		expect(loaded?.analysisContext?.sections).toHaveLength(2);

		const report = await buildDecisionReportForUser(db, config, user.id, {
			kind: "id",
			id: saved.id,
		});

		expect(report?.text).toContain("whale_alert");
		expect(report?.text).toContain("POLYM");
		expect(report?.text).not.toMatch(/News & Social Media:[\s\S]*None/);
	});
});
