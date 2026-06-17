import { describe, expect, it } from "vitest";
import { formatDailySummary } from "@/notifications/telegram/formatDailySummary.js";

describe("formatDailySummary", () => {
	it("includes period returns, trade count, holdings, and current value", () => {
		const message = formatDailySummary({
			tradesLast24h: [
				{
					id: 1,
					portfolioId: 1,
					createdAt: new Date(),
					side: "buy",
					symbol: "BTC",
					quantity: 0.01,
					priceUsd: 95_000,
					quoteValueUsd: 950,
				},
			],
			btcValue: 0.105,
			usdValue: 9_975,
			startingBtcValue: 0.1,
			startingUsdValue: 10_000,
			accumulateSymbol: "BTC",
			dailyReturnPct: 1.2,
			weeklyReturnPct: -0.5,
			allTimeReturnPct: 4.8,
			holdings: { BTC: 0.1, USDC: 5000 },
		});

		expect(message).toContain("📅*__AccumulaBot — Daily Summary__*📅");
		expect(message).toContain("__Current BTC Amount vs Starting BTC Value:__");
		expect(message).toContain("24h: *\\+1\\.20%* · 1 trade\\(s\\)");
		expect(message).toContain("7d: *\\-0\\.50%*");
		expect(message).toContain("All\\-time: *\\+4\\.80%*");
		expect(message).toContain("__Holdings:__");
		expect(message).toContain("BTC: *0\\.1*");
		expect(message).toContain("USDC: *5,000*");
		expect(message).toContain("__Starting value:__");
		expect(message).toContain("BTC: *0\\.10000000*");
		expect(message).toContain("USD: *10,000\\.00*");
		expect(message).toContain("__Current value:__");
		expect(message).toContain("BTC: *0\\.10500000* · *\\+4\\.80%* all\\-time");
		expect(message).toContain("USD: * 9,975\\.00* · *\\-0\\.25%* all\\-time");
	});

	it("includes the full macro briefing text when provided", () => {
		const generatedAt = new Date("2026-06-16T07:00:00.000Z");
		const message = formatDailySummary({
			tradesLast24h: [],
			btcValue: 0.105,
			usdValue: 9_975,
			startingBtcValue: 0.1,
			startingUsdValue: 10_000,
			accumulateSymbol: "BTC",
			dailyReturnPct: 1.2,
			weeklyReturnPct: -0.5,
			allTimeReturnPct: 4.8,
			holdings: { BTC: 0.1 },
			macroBriefing: {
				content: "Risk-off ahead of CPI. ETF flows steady.",
				generatedAt,
			},
		});

		expect(message).toContain("📅*__AccumulaBot — Daily Briefing__*📅");
		expect(message).toContain("__Macro briefing:__");
		expect(message).toContain("_Generated 2026\\-06\\-16T07:00:00\\.000Z_");
		expect(message).toContain("Risk\\-off ahead of CPI\\. ETF flows steady\\.");
		expect(message.indexOf("Risk\\-off ahead of CPI")).toBeLessThan(
			message.indexOf("__Current BTC Amount vs Starting BTC Value:__"),
		);
	});

	it("escapes MarkdownV2 in macro briefing content", () => {
		const message = formatDailySummary({
			tradesLast24h: [],
			btcValue: 0.1,
			usdValue: 10_000,
			startingBtcValue: 0.1,
			startingUsdValue: 10_000,
			accumulateSymbol: "BTC",
			dailyReturnPct: 0,
			weeklyReturnPct: 0,
			allTimeReturnPct: 0,
			holdings: { BTC: 0.1 },
			macroBriefing: {
				content: "BTC < $70k & risk-off",
				generatedAt: new Date("2026-06-16T07:00:00.000Z"),
			},
		});

		expect(message).toContain("BTC < $70k & risk\\-off");
	});

	it("renders markdown citation links as Telegram MarkdownV2 links", () => {
		const message = formatDailySummary({
			tradesLast24h: [],
			btcValue: 0.1,
			usdValue: 10_000,
			startingBtcValue: 0.1,
			startingUsdValue: 10_000,
			accumulateSymbol: "BTC",
			dailyReturnPct: 0,
			weeklyReturnPct: 0,
			allTimeReturnPct: 0,
			holdings: { BTC: 0.1 },
			macroBriefing: {
				content: "Hot CPI ([Reuters](https://reuters.com/article)) today.",
				generatedAt: new Date("2026-06-16T07:00:00.000Z"),
			},
		});

		expect(message).toContain(
			"Hot CPI \\([Reuters](https://reuters.com/article)\\) today\\.",
		);
	});
});
