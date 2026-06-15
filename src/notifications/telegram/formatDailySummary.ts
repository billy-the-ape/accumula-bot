import type { PortfolioHoldings } from "@/domain/types.js";
import type { StoredTrade } from "@/schemas/Trade.js";

export type DailySummaryInput = {
	tradesLast24h: readonly StoredTrade[];
	btcValue: number;
	usdValue: number;
	startingBtcValue: number;
	startingUsdValue: number;
	accumulateSymbol: string;
	dailyReturnPct: number;
	weeklyReturnPct: number;
	allTimeReturnPct: number;
	holdings: PortfolioHoldings;
};

function formatReturnPct(value: number): string {
	return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatUsd(value: number): string {
	return value.toLocaleString("en-US", {
		maximumFractionDigits: 2,
		minimumFractionDigits: 2,
	});
}

function formatHoldings(holdings: PortfolioHoldings): string {
	const parts = Object.entries(holdings)
		.filter(([, quantity]) => quantity > 0)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(
			([symbol, quantity]) =>
				`${symbol}: <b>${quantity.toLocaleString("en-US", { maximumFractionDigits: 8 })}</b>`,
		);

	return parts.length > 0 ? parts.join("\n") : "(empty)";
}

export function formatDailySummary(input: DailySummaryInput): string {
	const lines = [
		"📅<b><u>AccumulaBot — Daily Summary</u></b>📅",
		"",
		"<u>Current BTC Amount vs Starting BTC Value:</u>",
		`24h: <b>${formatReturnPct(input.dailyReturnPct)}</b> · ${input.tradesLast24h.length} trade(s)`,
		`7d: <b>${formatReturnPct(input.weeklyReturnPct)}</b>`,
		`All-time: <b>${formatReturnPct(input.allTimeReturnPct)}</b>`,
		"",
		`<u>Holdings:</u>`,
		formatHoldings(input.holdings),
		"",
		`<u>Starting value:</u>`,
		`${input.accumulateSymbol}: <b>${input.startingBtcValue.toFixed(8)}</b>`,
		`USD: <b>${formatUsd(input.startingUsdValue)}</b>`,
		"",
		`<u>Current value:</u>`,
		`${input.accumulateSymbol}: <b>${input.btcValue.toFixed(8)}</b>`,
		`USD: <b> ${formatUsd(input.usdValue)}</b>`,
	];

	return lines.join("\n");
}
