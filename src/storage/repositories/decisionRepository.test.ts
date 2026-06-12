import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import type { TradeRecommendation } from "@/schemas/TradeRecommendation.js";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
import {
	findDecisionById,
	listRecentDecisions,
	saveDecision,
} from "@/storage/repositories/decisionRepository.js";

const sampleRecommendation: TradeRecommendation = {
	rankings: [
		{ asset: "SOL", score: 0.95 },
		{ asset: "ETH", score: 0.25 },
		{ asset: "BTC", score: 0 },
	],
	recommended_asset: "SOL",
	confidence: 0.85,
	reason: "SOL shows strong recent performance.",
};

const sampleMarketSnapshots = [
	{
		asset: "BTC",
		priceUsd: 98500,
		change24hPct: 1.2,
		change7dPct: 4.5,
		change30dPct: 12,
		volumeTrend: "rising" as const,
		marketCapUsd: 1_940_000_000_000,
	},
	{
		asset: "SOL",
		priceUsd: 185,
		change24hPct: 2.4,
		change7dPct: 6.8,
		change30dPct: 18.2,
		volumeTrend: "rising" as const,
		marketCapUsd: 88_000_000_000,
	},
];

describe("decisionRepository", () => {
	let client: Client | undefined;
	let db: AppDatabase | undefined;

	afterEach(() => {
		client?.close();
		client = undefined;
		db = undefined;
	});

	it("persists and reads a decision", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const saved = await saveDecision(db, {
			assetToAccumulate: "BTC",
			recommendation: sampleRecommendation,
			marketSnapshots: sampleMarketSnapshots,
			llm: {
				provider: "openai_compatible",
				model: "qwen3:8b",
			},
		});

		expect(saved.id).toBeGreaterThan(0);
		expect(saved.assetToAccumulate).toBe("BTC");
		expect(saved.recommendation.recommended_asset).toBe("SOL");
		expect(saved.marketSnapshots).toHaveLength(2);

		const loaded = await findDecisionById(db, saved.id);
		expect(loaded?.recommendation).toEqual(sampleRecommendation);
	});

	it("lists recent decisions newest first", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		await saveDecision(db, {
			assetToAccumulate: "BTC",
			recommendation: {
				...sampleRecommendation,
				recommended_asset: "ETH",
			},
			marketSnapshots: sampleMarketSnapshots,
			llm: { provider: "openai_compatible", model: "qwen3:8b" },
		});

		const latest = await saveDecision(db, {
			assetToAccumulate: "BTC",
			recommendation: sampleRecommendation,
			marketSnapshots: sampleMarketSnapshots,
			llm: { provider: "openai_compatible", model: "qwen3:8b" },
		});

		const recent = await listRecentDecisions(db, 10);
		expect(recent).toHaveLength(2);
		expect(recent[0]?.id).toBe(latest.id);
	});
});
