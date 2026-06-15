import type { StoredTrade } from "@/schemas/Trade.js";

export type TradeNotificationInput = {
	trades: readonly StoredTrade[];
	recommendedAsset: string;
	reason: string;
	btcValue: number;
	returnPct: number;
	accumulateSymbol: string;
};

function formatUsd(value: number): string {
	return value.toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 2,
	});
}

function formatQuantity(value: number): string {
	return value.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function formatTradeLine(trade: StoredTrade): string {
	const action = trade.side.toUpperCase();
	return `${action} ${formatQuantity(trade.quantity)} ${trade.symbol} @ ${formatUsd(trade.priceUsd)} (${formatUsd(trade.quoteValueUsd)})`;
}

export function formatTradeNotification(input: TradeNotificationInput): string {
	const lines = [
		"💰<u><b>AccumulaBot — Trade Executed</b></u>💰",
		"",
		...input.trades.map(formatTradeLine),
		"",
		`<u>Reason:</u> ${input.reason}`,
		"",
		`<u>Accumulated Value:</u> ${input.btcValue.toFixed(8)} ${input.accumulateSymbol} (${input.returnPct >= 0 ? "+" : ""}${input.returnPct.toFixed(2)}% all-time vs initial baseline)`,
	];

	return lines.join("\n");
}
