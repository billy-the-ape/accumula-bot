import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import { sendDailySummary } from "@/notifications/telegram/sendDailySummary.js";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
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

function telegramOkFetch() {
	return vi.fn(async () =>
		Response.json({
			ok: true,
			result: { message_id: 1 },
		}),
	);
}

function chatIdsFromFetchMock(
	fetchImpl: ReturnType<typeof telegramOkFetch>,
): string[] {
	return (fetchImpl.mock.calls as unknown as [string, RequestInit][]).map(
		([, requestInit]) => {
			const body = JSON.parse(String(requestInit.body)) as {
				chat_id: string;
			};
			return body.chat_id;
		},
	);
}

describe("sendDailySummary", () => {
	let client: Client | undefined;
	let db: AppDatabase | undefined;

	afterEach(() => {
		client?.close();
		client = undefined;
		db = undefined;
	});

	it("throws when Telegram bot token is not configured", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
		});

		await expect(sendDailySummary(config, db)).rejects.toThrow(
			/TELEGRAM_BOT_TOKEN/i,
		);
	});

	it("returns empty result when no active portfolios exist", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			TELEGRAM_BOT_TOKEN: "test-token",
		});

		const result = await sendDailySummary(config, db, {
			marketSnapshots,
			fetchImpl: telegramOkFetch(),
		});

		expect(result).toEqual({ sentCount: 0, recipientChatIds: [] });
	});

	it("sends a daily summary to each active portfolio owner", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const userA = await getOrCreateTelegramUser(db, "111");
		const userB = await getOrCreateTelegramUser(db, "222");

		await createUserPortfolio(db, {
			telegramUserId: userA.id,
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 10_000 },
			initialBtcBaseline: 0.1,
			initialQuoteBaseline: 10_000,
			riskTolerance: "medium",
		});
		await createUserPortfolio(db, {
			telegramUserId: userB.id,
			assetToAccumulate: "BTC",
			cashSymbol: "USDC",
			initialHoldings: { USDC: 10_000 },
			initialBtcBaseline: 0.1,
			initialQuoteBaseline: 10_000,
			riskTolerance: "high",
		});

		const fetchImpl = telegramOkFetch();
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			TELEGRAM_BOT_TOKEN: "test-token",
		});

		const result = await sendDailySummary(config, db, {
			marketSnapshots,
			fetchImpl,
		});

		expect(result.sentCount).toBe(2);
		expect(result.recipientChatIds.sort()).toEqual(["111", "222"]);
		expect(fetchImpl).toHaveBeenCalledTimes(2);

		expect(chatIdsFromFetchMock(fetchImpl).sort()).toEqual(["111", "222"]);
	});

	it("mirrors daily summaries to admin chat when configured", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

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

		const fetchImpl = telegramOkFetch();
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			TELEGRAM_BOT_TOKEN: "test-token",
			TELEGRAM_CHAT_ID: "999",
		});

		const result = await sendDailySummary(config, db, {
			marketSnapshots,
			fetchImpl,
		});

		expect(result).toEqual({ sentCount: 1, recipientChatIds: ["111"] });
		expect(fetchImpl).toHaveBeenCalledTimes(2);

		expect(chatIdsFromFetchMock(fetchImpl).sort()).toEqual(["111", "999"]);
	});
});
