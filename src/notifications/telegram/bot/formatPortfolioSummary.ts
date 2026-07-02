import type { PortfolioHoldings } from "@/domain/types.js";
import {
	bold,
	boldUnderline,
	escapeMarkdownV2,
	italic,
	underline,
} from "@/notifications/telegram/escapeMarkdownV2.js";
import {
	type AssetPerformance,
	formatPortfolioPerformanceLines,
} from "@/notifications/telegram/formatPortfolioPerformance.js";
import {
	DEFAULT_TELEGRAM_USER_SETTINGS,
	formatUserDateTime,
} from "@/notifications/telegram/formatUserDateTime.js";
import type { PortfolioRiskSetting } from "@/risk/riskTolerance.js";
import { formatPortfolioRiskLabel } from "@/risk/riskTolerance.js";
import type { TelegramUserSettings } from "@/storage/telegramUserSettings.js";

export type { AssetPerformance };

export type PortfolioSummaryInput = {
	accumulateSymbol: string;
	startedAt: Date;
	holdings: PortfolioHoldings;
	startingUsdValue: number;
	currentUsdValue: number;
	accumulateValue: number;
	startingAccumulateValue: number;
	allTimeReturnPct: number;
	assetPerformances: readonly AssetPerformance[];
	riskTolerance: PortfolioRiskSetting;
	minConfidence: number;
};

function formatHoldings(holdings: PortfolioHoldings): string {
	const parts = Object.entries(holdings)
		.filter(([, quantity]) => quantity > 0)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(
			([symbol, quantity]) =>
				`${escapeMarkdownV2(symbol)}: ${bold(quantity.toLocaleString("en-US", { maximumFractionDigits: 8 }))}`,
		);

	return parts.length > 0 ? parts.join("\n") : "\\(empty\\)";
}

function formatRiskToleranceLabel(tolerance: PortfolioRiskSetting): string {
	return formatPortfolioRiskLabel(tolerance);
}

export type FormatPortfolioSummaryOptions = {
	includeResetHint?: boolean;
	includeLiquidateHint?: boolean;
	userDateTimeSettings?: Pick<TelegramUserSettings, "locale" | "timezone">;
};

export function formatPortfolioSummary(
	input: PortfolioSummaryInput,
	options: FormatPortfolioSummaryOptions = {},
): string {
	const performanceLines = formatPortfolioPerformanceLines(input);

	const userDateTimeSettings =
		options.userDateTimeSettings ?? DEFAULT_TELEGRAM_USER_SETTINGS;

	const lines = [
		boldUnderline("Portfolio summary"),
		italic(
			`Started ${formatUserDateTime(input.startedAt, userDateTimeSettings)}`,
		),
		"",
		underline("Holdings:"),
		formatHoldings(input.holdings),
		"",
		underline("Performance:"),
		...performanceLines,
		"",
		underline("Settings:"),
		`Risk tolerance: ${bold(formatRiskToleranceLabel(input.riskTolerance))}`,
		`Min confidence to trade: ${bold(String(input.minConfidence))}`,
	];

	if (options.includeResetHint) {
		lines.push(
			"",
			escapeMarkdownV2(
				"Send /reset to deactivate this portfolio. Use /start to create a new one.",
			),
		);
	}

	if (options.includeLiquidateHint) {
		lines.push(
			"",
			escapeMarkdownV2(
				"Send /liquidate to close this live portfolio and withdraw your USDC.",
			),
		);
	}

	return lines.join("\n");
}
