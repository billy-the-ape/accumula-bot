import {
	getCryptocurrency,
	isKnownCryptocurrencySymbol,
} from "@/config/assets.js";
import {
	boldUnderline,
	escapeMarkdownV2,
} from "@/notifications/telegram/escapeMarkdownV2.js";
import type { StoredTrade } from "@/schemas/Trade.js";

function formatUsd(value: number): string {
	return value.toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 2,
	});
}

function formatQuantity(value: number): string {
	return value
		.toLocaleString("en-US", { maximumFractionDigits: 8 })
		.replace(/\.?0+$/, "");
}

function isStableSymbol(symbol: string): boolean {
	if (!isKnownCryptocurrencySymbol(symbol)) {
		return false;
	}

	return getCryptocurrency(symbol).isStable === true;
}

function formatTradeLine(trade: StoredTrade): string {
	const action = trade.side.toUpperCase();
	const quantity = `${formatQuantity(trade.quantity)} ${trade.symbol}`;

	if (isStableSymbol(trade.symbol)) {
		return `${action} ${escapeMarkdownV2(quantity)}`;
	}

	return `${action} ${escapeMarkdownV2(quantity)} \\(${escapeMarkdownV2(formatUsd(trade.quoteValueUsd))}\\)`;
}

export function formatCompactTradeReport(
	trades: readonly StoredTrade[],
): string | null {
	if (trades.length === 0) {
		return null;
	}

	return [
		`💰${boldUnderline("AccumulaBot — Trade Executed")}💰`,
		"",
		...trades.map(formatTradeLine),
	].join("\n");
}
