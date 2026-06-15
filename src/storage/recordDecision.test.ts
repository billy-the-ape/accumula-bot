import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TradeRecommendation } from "@/schemas/TradeRecommendation.js";
import { createDatabase } from "@/storage/db.js";
import { recordDecision } from "@/storage/recordDecision.js";
import { findDecisionById } from "@/storage/repositories/decisionRepository.js";

const sampleRecommendation: TradeRecommendation = {
	outlooks: [
		{
			asset: "SOL",
			direction_score: 8,
			confidence: 0.8,
			reason: "Strong momentum.",
		},
		{
			asset: "BTC",
			direction_score: 5,
			confidence: 0.6,
			reason: "Stable.",
		},
		{
			asset: "ETH",
			direction_score: 4,
			confidence: 0.6,
			reason: "Flat.",
		},
	],
	summary: "Buy SOL.",
};

const sampleInput = {
	assetToAccumulate: "BTC",
	recommendation: sampleRecommendation,
	marketSnapshots: [
		{
			asset: "SOL",
			priceUsd: 185,
			change24hPct: 2.4,
			change7dPct: 6.8,
			change30dPct: 18.2,
			volumeTrend: "rising" as const,
			marketCapUsd: 88_000_000_000,
		},
	],
	llm: { provider: "openai_compatible", model: "qwen3:8b" },
};

describe("recordDecision", () => {
	it("returns the persisted decision", async () => {
		const saved = await recordDecision(":memory:", sampleInput);

		expect(saved.id).toBeGreaterThan(0);
		expect(saved.recommendation).toEqual(sampleRecommendation);
	});

	it("writes to disk so a later connection can read the row", async () => {
		const dbPath = path.join(
			os.tmpdir(),
			`accumula-test-${Date.now()}-${Math.random()}.db`,
		);

		try {
			const saved = await recordDecision(dbPath, sampleInput);
			const connection = await createDatabase(dbPath);

			try {
				const loaded = await findDecisionById(connection.db, saved.id);
				expect(loaded?.recommendation).toEqual(sampleRecommendation);
			} finally {
				connection.client.close();
			}
		} finally {
			try {
				fs.rmSync(dbPath, { force: true });
			} catch {
				// Windows may briefly lock the file after close.
			}
		}
	});
});
