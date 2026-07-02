import { isUsdStablecoinSymbol } from "@/config/assets.js";
import { computeReturnFraction } from "@/domain/accumulateBenchmark.js";
import {
	bold,
	escapeMarkdownV2,
} from "@/notifications/telegram/escapeMarkdownV2.js";

export type AssetPerformance = {
	symbol: string;
	usdValue: number;
	returnPct: number;
};

export type PortfolioPerformanceInput = {
	accumulateSymbol: string;
	startingUsdValue: number;
	currentUsdValue: number;
	accumulateValue: number;
	startingAccumulateValue: number;
	assetPerformances: readonly AssetPerformance[];
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

function formatAssetPerformanceLines(
	performances: readonly AssetPerformance[],
): string[] {
	return performances.map(
		({ symbol, usdValue, returnPct }) =>
			`${escapeMarkdownV2(symbol)}: ${bold(`$${formatUsd(usdValue)}`)} \\(${bold(formatReturnPct(returnPct))}\\)`,
	);
}

export function formatPortfolioPerformanceLines(
	input: PortfolioPerformanceInput,
): string[] {
	const usdAllTimeReturnPct =
		computeReturnFraction(input.currentUsdValue, input.startingUsdValue) * 100;

	const accumulatePerformanceLine = isUsdStablecoinSymbol(
		input.accumulateSymbol,
	)
		? undefined
		: `${escapeMarkdownV2(input.accumulateSymbol)}: ${bold(input.accumulateValue.toFixed(8))} \\(started ${bold(input.startingAccumulateValue.toFixed(8))}\\)`;

	return [
		...formatAssetPerformanceLines(input.assetPerformances),
		`Total USD Value: ${bold(`$${formatUsd(input.currentUsdValue)}`)} \\(${bold(formatReturnPct(usdAllTimeReturnPct))}\\)`,
		...(accumulatePerformanceLine ? [accumulatePerformanceLine] : []),
	];
}
