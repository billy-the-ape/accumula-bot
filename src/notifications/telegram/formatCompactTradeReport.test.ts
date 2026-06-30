import { describe, expect, it } from "vitest";
import { formatCompactTradeReport } from "@/notifications/telegram/formatCompactTradeReport.js";
import type { StoredTrade } from "@/schemas/Trade.js";

const btcTrade: StoredTrade = {
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

describe("formatCompactTradeReport", () => {
	it("returns null when there are no trades", () => {
		expect(formatCompactTradeReport([])).toBeNull();
	});

	it("includes USD equivalent for non-stablecoin trades", () => {
		const text = formatCompactTradeReport([btcTrade]);
		expect(text).toContain("Trade Executed");
		expect(text).toContain("BUY");
		expect(text).toContain("BTC");
		expect(text).toContain("$950\\.00");
	});

	it("omits USD equivalent for stablecoin trades", () => {
		const usdcTrade: StoredTrade = {
			...btcTrade,
			id: 2,
			side: "sell",
			symbol: "USDC",
			quantity: 500,
			priceUsd: 1,
			quoteValueUsd: 500,
		};

		const text = formatCompactTradeReport([usdcTrade]);
		expect(text).toContain("SELL");
		expect(text).toContain("USDC");
		expect(text).not.toContain("$500.00");
	});
});
