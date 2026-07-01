import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
import {
	createUserPortfolio,
	deactivateUserPortfolios,
	getActivePortfolioForUser,
	listActivePortfolios,
} from "@/storage/repositories/portfolioRepository.js";
import {
	findTelegramUserByChatId,
	getOrCreateTelegramUser,
	updateTelegramUserOnboarding,
	updateTelegramUserSettings,
} from "@/storage/repositories/telegramUserRepository.js";

describe("telegramUserRepository", () => {
	let client: Client | undefined;
	let db: AppDatabase | undefined;

	afterEach(() => {
		client?.close();
		client = undefined;
		db = undefined;
	});

	it("creates a telegram user on first contact", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const user = await getOrCreateTelegramUser(db, "12345");

		expect(user.id).toBeGreaterThan(0);
		expect(user.telegramChatId).toBe("12345");
		expect(user.onboardingState).toBe("awaiting_mode_selection");
		expect(user.onboardingDraftJson).toBeNull();
		expect(user.settings.verbose).toBe(false);
		expect(user.settings.defaultRiskTolerance).toBe("medium");
		expect(user.settings.locale).toBeNull();
		expect(user.settings.timezone).toBeNull();
	});

	it("returns the same user on subsequent getOrCreate", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const first = await getOrCreateTelegramUser(db, "999");
		const second = await getOrCreateTelegramUser(db, "999");

		expect(second.id).toBe(first.id);
		expect(await findTelegramUserByChatId(db, "999")).toEqual(second);
	});

	it("updates onboarding state and draft json", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const user = await getOrCreateTelegramUser(db, "555");
		const updated = await updateTelegramUserOnboarding(db, user.id, {
			onboardingState: "awaiting_risk_tolerance",
			onboardingDraftJson: JSON.stringify({ startingValueUsd: 10_000 }),
		});

		expect(updated.onboardingState).toBe("awaiting_risk_tolerance");
		expect(updated.onboardingDraftJson).toBe(
			JSON.stringify({ startingValueUsd: 10_000 }),
		);
	});

	it("updates user settings", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const user = await getOrCreateTelegramUser(db, "777");
		const updated = await updateTelegramUserSettings(db, user.id, {
			verbose: true,
		});

		expect(updated.settings.verbose).toBe(true);
	});

	it("updates default risk, locale, and timezone settings", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const user = await getOrCreateTelegramUser(db, "888");
		const updated = await updateTelegramUserSettings(db, user.id, {
			defaultRiskTolerance: "high",
			locale: "en-GB",
			timezone: "Europe/London",
		});

		expect(updated.settings.defaultRiskTolerance).toBe("high");
		expect(updated.settings.locale).toBe("en-GB");
		expect(updated.settings.timezone).toBe("Europe/London");
	});
});

describe("portfolioRepository multi-user", () => {
	let client: Client | undefined;
	let db: AppDatabase | undefined;

	afterEach(() => {
		client?.close();
		client = undefined;
		db = undefined;
	});

	const portfolioInput = {
		assetToAccumulate: "BTC",
		cashSymbol: "USDC",
		initialHoldings: { USDC: 10_000 },
		initialBtcBaseline: 0.1,
		initialQuoteBaseline: 10_000,
	};

	it("creates a user-linked active portfolio", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const user = await getOrCreateTelegramUser(db, "111");

		const portfolio = await createUserPortfolio(db, {
			...portfolioInput,
			telegramUserId: user.id,
			riskTolerance: "low",
		});

		expect(portfolio.telegramUserId).toBe(user.id);
		expect(portfolio.riskTolerance).toBe("low");
		expect(portfolio.isActive).toBe(true);

		const active = await getActivePortfolioForUser(db, user.id);
		expect(active?.id).toBe(portfolio.id);
	});

	it("deactivates prior portfolio when creating a new one for the same user", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const user = await getOrCreateTelegramUser(db, "222");
		const first = await createUserPortfolio(db, {
			...portfolioInput,
			telegramUserId: user.id,
			riskTolerance: "medium",
		});

		const second = await createUserPortfolio(db, {
			...portfolioInput,
			initialHoldings: { USDC: 5_000 },
			initialQuoteBaseline: 5_000,
			telegramUserId: user.id,
			riskTolerance: "high",
		});

		expect(second.id).not.toBe(first.id);
		expect(await getActivePortfolioForUser(db, user.id)).toEqual(second);

		await deactivateUserPortfolios(db, user.id);
		expect(await getActivePortfolioForUser(db, user.id)).toBeUndefined();
	});

	it("lists only active user-linked portfolios with chat ids", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const userA = await getOrCreateTelegramUser(db, "333");
		const userB = await getOrCreateTelegramUser(db, "444");

		const portfolioA = await createUserPortfolio(db, {
			...portfolioInput,
			telegramUserId: userA.id,
			riskTolerance: "medium",
		});

		await createUserPortfolio(db, {
			...portfolioInput,
			telegramUserId: userB.id,
			riskTolerance: "high",
		});

		const active = await listActivePortfolios(db);
		expect(active).toHaveLength(2);
		expect(active.map((p) => p.telegramChatId).sort()).toEqual(["333", "444"]);
		expect(active.find((p) => p.id === portfolioA.id)?.riskTolerance).toBe(
			"medium",
		);
	});
});
