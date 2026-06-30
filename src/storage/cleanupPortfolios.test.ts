import type { Client } from "@libsql/client";
import { count } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
	cleanupPortfolios,
	previewPortfolioCleanup,
} from "@/storage/cleanupPortfolios.js";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
import { saveDecision } from "@/storage/repositories/decisionRepository.js";
import { saveMacroBriefing } from "@/storage/repositories/macroBriefingRepository.js";
import {
	createPortfolio,
	createUserPortfolio,
} from "@/storage/repositories/portfolioRepository.js";
import { saveScoredSocialMediaPosts } from "@/storage/repositories/socialMediaPostRepository.js";
import { getOrCreateTelegramUser } from "@/storage/repositories/telegramUserRepository.js";
import { recordTrade } from "@/storage/repositories/tradeRepository.js";
import {
	decisions,
	macroBriefings,
	portfolios,
	socialMediaPosts,
	telegramUsers,
	trades,
} from "@/storage/schema.js";

describe("cleanupPortfolios", () => {
	let client: Client | undefined;
	let db: AppDatabase | undefined;

	afterEach(() => {
		client?.close();
		client = undefined;
		db = undefined;
	});

	async function seedSharedData(connection: AppDatabase) {
		await saveDecision(connection, {
			assetToAccumulate: "BTC",
			recommendation: {
				outlooks: [
					{
						asset: "BTC",
						direction_score: 5,
						confidence: 0.7,
						reason: "Stable",
					},
				],
				summary: "Hold",
			},
			marketSnapshots: [],
			llm: { provider: "ollama", model: "qwen3:8b" },
		});

		await saveMacroBriefing(connection, {
			content: "Macro backdrop",
			promptVersion: "v1",
			llm: { provider: "openai_compatible", model: "gpt-5.5" },
		});

		await saveScoredSocialMediaPosts(connection, [
			{
				externalId: "tweet-1",
				source: "twitter",
				username: "example",
				text: "BTC update",
				postedAt: new Date("2026-06-01T12:00:00.000Z"),
				impressions: 100,
				relevanceScore: 7,
				llm: { provider: "ollama", model: "qwen3:8b" },
			},
		]);
	}

	it("preview legacy counts orphan portfolios only", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		await createPortfolio(db, {
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 10_000 },
			initialBtcBaseline: 0.1,
			initialQuoteBaseline: 10_000,
		});

		const user = await getOrCreateTelegramUser(db, "111");
		await createUserPortfolio(db, {
			telegramUserId: user.id,
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 10_000 },
			initialBtcBaseline: 0.1,
			initialQuoteBaseline: 10_000,
			riskTolerance: "medium",
		});

		const preview = await previewPortfolioCleanup(db, "legacy");

		expect(preview.portfolios).toBe(1);
		expect(preview.positions).toBe(1);
		expect(preview.trades).toBe(0);
		expect(preview.telegramUsers).toBe(0);
	});

	it("cleans legacy portfolios while preserving tweets, macro, and decisions", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		await seedSharedData(db);

		const legacy = await createPortfolio(db, {
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 10_000 },
			initialBtcBaseline: 0.1,
			initialQuoteBaseline: 10_000,
		});

		await recordTrade(db, {
			portfolioId: legacy.id,
			side: "buy",
			symbol: "ETH",
			quantity: 1,
			priceUsd: 3_000,
			quoteValueUsd: 3_000,
		});

		const user = await getOrCreateTelegramUser(db, "111");
		await createUserPortfolio(db, {
			telegramUserId: user.id,
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 10_000 },
			initialBtcBaseline: 0.1,
			initialQuoteBaseline: 10_000,
			riskTolerance: "medium",
		});

		const result = await cleanupPortfolios(db, "legacy");

		expect(result.portfolios).toBe(1);
		expect(result.trades).toBe(1);

		const portfolioCount = await db.select({ value: count() }).from(portfolios);
		const tradeCount = await db.select({ value: count() }).from(trades);
		const userCount = await db.select({ value: count() }).from(telegramUsers);
		const decisionCount = await db.select({ value: count() }).from(decisions);
		const macroCount = await db.select({ value: count() }).from(macroBriefings);
		const socialCount = await db
			.select({ value: count() })
			.from(socialMediaPosts);

		expect(portfolioCount[0]?.value).toBe(1);
		expect(tradeCount[0]?.value).toBe(0);
		expect(userCount[0]?.value).toBe(1);
		expect(decisionCount[0]?.value).toBe(1);
		expect(macroCount[0]?.value).toBe(1);
		expect(socialCount[0]?.value).toBe(1);
	});

	it("cleans all portfolio data and telegram users when scope is all", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		await seedSharedData(db);

		await createPortfolio(db, {
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 10_000 },
			initialBtcBaseline: 0.1,
			initialQuoteBaseline: 10_000,
		});

		const user = await getOrCreateTelegramUser(db, "111");
		await createUserPortfolio(db, {
			telegramUserId: user.id,
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 10_000 },
			initialBtcBaseline: 0.1,
			initialQuoteBaseline: 10_000,
			riskTolerance: "medium",
		});

		const result = await cleanupPortfolios(db, "all");

		expect(result.portfolios).toBe(2);
		expect(result.telegramUsers).toBe(1);

		const portfolioCount = await db.select({ value: count() }).from(portfolios);
		const userCount = await db.select({ value: count() }).from(telegramUsers);
		const decisionCount = await db.select({ value: count() }).from(decisions);
		const macroCount = await db.select({ value: count() }).from(macroBriefings);
		const socialCount = await db
			.select({ value: count() })
			.from(socialMediaPosts);

		expect(portfolioCount[0]?.value).toBe(0);
		expect(userCount[0]?.value).toBe(0);
		expect(decisionCount[0]?.value).toBe(1);
		expect(macroCount[0]?.value).toBe(1);
		expect(socialCount[0]?.value).toBe(1);
	});
});
