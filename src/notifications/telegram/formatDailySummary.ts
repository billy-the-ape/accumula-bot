import { computeReturnFraction } from "@/domain/accumulateBenchmark.js";
import type { PortfolioHoldings } from "@/domain/types.js";
import { formatMacroBriefingContentForTelegram } from "@/macro/macroBriefingContent.js";
import {
	bold,
	escapeMarkdownV2,
	italic,
	underline,
	underlineBold,
} from "@/notifications/telegram/escapeMarkdownV2.js";
import { formatUserDateTime } from "@/notifications/telegram/formatUserDateTime.js";
import type { StoredTrade } from "@/schemas/Trade.js";
import type { TelegramUserSettings } from "@/storage/telegramUserSettings.js";

export type DailySummaryMacroBriefing = {
	content: string;
	generatedAt: Date;
};

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
	macroBriefing?: DailySummaryMacroBriefing;
	userDateTimeSettings?: Pick<TelegramUserSettings, "locale" | "timezone">;
};

function formatMacroBriefingSection(
	macroBriefing: DailySummaryMacroBriefing,
	userDateTimeSettings?: Pick<TelegramUserSettings, "locale" | "timezone">,
): string[] {
	const generatedAt = formatUserDateTime(
		macroBriefing.generatedAt,
		userDateTimeSettings ?? { locale: null, timezone: null },
	);
	return [
		underline("Macro briefing:"),
		italic(`Generated ${generatedAt}`),
		formatMacroBriefingContentForTelegram(macroBriefing.content),
		"",
	];
}

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
				`${symbol}: ${bold(quantity.toLocaleString("en-US", { maximumFractionDigits: 8 }))}`,
		);

	return parts.length > 0 ? parts.join("\n") : "\\(empty\\)";
}

export function formatDailySummary(input: DailySummaryInput): string {
	const title = input.macroBriefing
		? `📅${underlineBold("AccumulaBot — Daily Briefing")}📅`
		: `📅${underlineBold("AccumulaBot — Daily Summary")}📅`;

	const lines = [
		title,
		"",
		...(input.macroBriefing
			? formatMacroBriefingSection(
					input.macroBriefing,
					input.userDateTimeSettings,
				)
			: []),
		underline("Current BTC Amount vs Starting BTC Value:"),
		`24h: ${bold(formatReturnPct(input.dailyReturnPct))} · ${input.tradesLast24h.length} trade\\(s\\)`,
		`7d: ${bold(formatReturnPct(input.weeklyReturnPct))}`,
		`All\\-time: ${bold(formatReturnPct(input.allTimeReturnPct))}`,
		"",
		underline("Holdings:"),
		formatHoldings(input.holdings),
		"",
		underline("Starting value:"),
		`${escapeMarkdownV2(input.accumulateSymbol)}: ${bold(input.startingBtcValue.toFixed(8))}`,
		`USD: ${bold(formatUsd(input.startingUsdValue))}`,
		"",
		underline("Current value:"),
		`${escapeMarkdownV2(input.accumulateSymbol)}: ${bold(input.btcValue.toFixed(8))} · ${bold(formatReturnPct(input.allTimeReturnPct))} all\\-time`,
		`USD: ${bold(` ${formatUsd(input.usdValue)}`)} · ${bold(formatReturnPct(computeReturnFraction(input.usdValue, input.startingUsdValue) * 100))} all\\-time`,
	];

	return lines.join("\n");
}
