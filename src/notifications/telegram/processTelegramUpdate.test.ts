import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "@/config/loadConfig.js";
import { portfolioModeCallbackData } from "@/notifications/telegram/bot/portfolioModeKeyboard.js";
import { riskToleranceCallbackData } from "@/notifications/telegram/bot/riskToleranceKeyboard.js";
import { processTelegramUpdate } from "@/notifications/telegram/processTelegramUpdate.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";
import type { MarketSnapshot } from "@/schemas/MarketSnapshot.js";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
import { getActivePortfolioForUser } from "@/storage/repositories/portfolioRepository.js";
import { findTelegramUserByChatId } from "@/storage/repositories/telegramUserRepository.js";

const validEnv = {
	CLOUDAMQP_URL: "amqp://localhost",
	ASSET_TO_ACCUMULATE: "btc",
	ASSET_TRADEABLE: "BTC, ETH, SOL, USDC",
	ASSET_STARTING: "USDC",
	LLM_BASE_URL: "http://127.0.0.1:11434",
	LLM_MODEL: "qwen3:8b",
	TELEGRAM_BOT_TOKEN: "bot-token",
	WALLET_ENCRYPTION_KEY: "b".repeat(64),
};

function mockMarketSnapshots(assets: Cryptocurrency[]): MarketSnapshot[] {
	return assets.map((asset) => ({
		asset: asset.symbol,
		priceUsd:
			asset.symbol === "BTC"
				? 98_500
				: asset.symbol === "ETH"
					? 3_400
					: asset.symbol === "SOL"
						? 185
						: 1,
		change24hPct: 0,
		change7dPct: 0,
		change30dPct: 0,
		volumeTrend: "flat",
		marketCapUsd: 1,
	}));
}

describe("processTelegramUpdate", () => {
	let client: Client | undefined;
	let db: AppDatabase | undefined;
	const config = loadConfig(validEnv);
	const chatId = "9001";
	const sendReply = vi.fn().mockResolvedValue(undefined);
	const acknowledgeCallback = vi.fn().mockResolvedValue(undefined);
	const fetchMarketSnapshotsImpl = vi.fn(async (assets: Cryptocurrency[]) =>
		mockMarketSnapshots(assets),
	);

	afterEach(() => {
		client?.close();
		client = undefined;
		db = undefined;
		sendReply.mockClear();
		acknowledgeCallback.mockClear();
		fetchMarketSnapshotsImpl.mockClear();
	});

	async function setupDb() {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;
		return db;
	}

	const deps = {
		sendReply,
		acknowledgeCallback,
		fetchMarketSnapshotsImpl,
	};

	it("completes paper onboarding and creates a user portfolio", async () => {
		const database = await setupDb();

		await processTelegramUpdate(
			database,
			config,
			{
				updateId: 1,
				chatId,
				incoming: { kind: "command", command: "start" },
			},
			deps,
		);

		await processTelegramUpdate(
			database,
			config,
			{
				updateId: 2,
				chatId,
				callbackQueryId: "cb-mode",
				incoming: {
					kind: "callback",
					data: portfolioModeCallbackData("paper"),
				},
			},
			deps,
		);

		await processTelegramUpdate(
			database,
			config,
			{
				updateId: 3,
				chatId,
				incoming: { kind: "text", text: "5000" },
			},
			deps,
		);

		await processTelegramUpdate(
			database,
			config,
			{
				updateId: 4,
				chatId,
				callbackQueryId: "cb-1",
				incoming: {
					kind: "callback",
					data: riskToleranceCallbackData("medium"),
				},
			},
			deps,
		);

		const user = await findTelegramUserByChatId(database, chatId);
		expect(user?.onboardingState).toBeNull();

		const portfolio = user
			? await getActivePortfolioForUser(database, user.id)
			: undefined;
		expect(portfolio?.holdings).toEqual({ USDC: 5_000 });
		expect(portfolio?.riskTolerance).toBe("medium");
		expect(portfolio?.initialQuoteBaseline).toBe(5_000);
		expect(portfolio?.mode).toBe("paper");

		expect(sendReply).toHaveBeenCalledTimes(4);
		expect(acknowledgeCallback).toHaveBeenCalledTimes(2);
		expect(fetchMarketSnapshotsImpl).toHaveBeenCalledOnce();
	});
});
