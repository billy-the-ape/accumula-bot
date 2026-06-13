import { describe, expect, it } from "vitest";
import { formatTradeNotification } from "@/notifications/telegram/formatTradeMessage.js";
import type { StoredTrade } from "@/schemas/Trade.js";

const sampleTrade: StoredTrade = {
	id: 1,
	portfolioId: 1,
	decisionId: 2,
	createdAt: new Date("2026-06-13T12:00:00Z"),
	side: "buy",
	symbol: "BTC",
	quantity: 0.01,
	priceUsd: 95_000,
	quoteValueUsd: 950,
};

describe("formatTradeNotification", () => {
	it("includes trades, recommendation, and portfolio return", () => {
		const message = formatTradeNotification({
			trades: [sampleTrade],
			recommendedAsset: "BTC",
			reason: "Strong relative momentum",
			btcValue: 0.105,
			returnPct: 2.5,
			accumulateSymbol: "BTC",
		});

		expect(message).toContain("Accumula Bot — Trade Executed");
		expect(message).toContain("BUY 0.01 BTC");
		expect(message).toContain("Recommended: BTC");
		expect(message).toContain("Reason: Strong relative momentum");
		expect(message).toContain("0.10500000 BTC (+2.50% all-time)");
	});
});
