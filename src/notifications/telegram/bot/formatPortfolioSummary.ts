import type { PortfolioHoldings } from "@/domain/types.js";
import {
	bold,
	escapeMarkdownV2,
	underline,
} from "@/notifications/telegram/escapeMarkdownV2.js";
import type { PortfolioRiskSetting } from "@/risk/riskTolerance.js";
import { formatPortfolioRiskLabel } from "@/risk/riskTolerance.js";

export type PortfolioSummaryInput = {
	accumulateSymbol: string;
	holdings: PortfolioHoldings;
	startingUsdValue: number;
	currentUsdValue: number;
	accumulateValue: number;
	startingAccumulateValue: number;
	allTimeReturnPct: number;
	riskTolerance: PortfolioRiskSetting;
	minConfidence: number;
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
};

export function formatPortfolioSummary(
	input: PortfolioSummaryInput,
	options: FormatPortfolioSummaryOptions = {},
): string {
	const lines = [
		underline("Portfolio summary"),
		"",
		underline("Holdings:"),
		formatHoldings(input.holdings),
		"",
		underline("Performance:"),
		`All\\-time: ${bold(formatReturnPct(input.allTimeReturnPct))}`,
		`USD: ${bold(formatUsd(input.currentUsdValue))} \\(started ${bold(formatUsd(input.startingUsdValue))}\\)`,
		`${escapeMarkdownV2(input.accumulateSymbol)}: ${bold(input.accumulateValue.toFixed(8))} \\(started ${bold(input.startingAccumulateValue.toFixed(8))}\\)`,
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
