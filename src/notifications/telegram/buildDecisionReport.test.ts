import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import { buildDecisionReportForUser } from "@/notifications/telegram/buildDecisionReport.js";
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
];

const recommendation: TradeRecommendation = {
	outlooks: [
		{ asset: "BTC", direction_score: 8, confidence: 0.72, reason: "Strong" },
	],
	summary: "Buy BTC",
};

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

		expect(report).toContain(`Decision:`);
		expect(report).toContain(`#${saved.id}`);
		expect(report).toContain("Buy BTC");
	});
});
