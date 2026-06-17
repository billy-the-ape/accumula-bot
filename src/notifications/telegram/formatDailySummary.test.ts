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

		expect(message).toContain("📅<b><u>AccumulaBot — Daily Summary</u></b>📅");
		expect(message).toContain(
			"<u>Current BTC Amount vs Starting BTC Value:</u>",
		);
		expect(message).toContain("24h: <b>+1.20%</b> · 1 trade(s)");
		expect(message).toContain("7d: <b>-0.50%</b>");
		expect(message).toContain("All-time: <b>+4.80%</b>");
		expect(message).toContain("<u>Holdings:</u>");
		expect(message).toContain("BTC: <b>0.1</b>");
		expect(message).toContain("USDC: <b>5,000</b>");
		expect(message).toContain("<u>Starting value:</u>");
		expect(message).toContain("BTC: <b>0.10000000</b>");
		expect(message).toContain("USD: <b>10,000.00</b>");
		expect(message).toContain("<u>Current value:</u>");
		expect(message).toContain("BTC: <b>0.10500000</b>");
		expect(message).toContain("USD: <b> 9,975.00</b>");
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

		expect(message).toContain("📅<b><u>AccumulaBot — Daily Briefing</u></b>📅");
		expect(message).toContain("<u>Macro briefing:</u>");
		expect(message).toContain("Generated 2026-06-16T07:00:00.000Z");
		expect(message).toContain("Risk-off ahead of CPI. ETF flows steady.");
		expect(message.indexOf("Risk-off ahead of CPI")).toBeLessThan(
			message.indexOf("<u>Current BTC Amount vs Starting BTC Value:</u>"),
		);
	});

	it("escapes HTML in macro briefing content", () => {
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

		expect(message).toContain("BTC &lt; $70k &amp; risk-off");
		expect(message).not.toContain("BTC < $70k");
	});
});
