import type { PlannedFill } from "@/execution/planTrades.js";
import { buildPriceMap } from "@/execution/priceMap.js";
import type { MarketSnapshot } from "@/schemas/MarketSnapshot.js";

export function repricePlannedFill(
	fill: PlannedFill,
	marketSnapshots: readonly MarketSnapshot[],
	cashSymbol: string,
	accumulateSymbol: string,
): PlannedFill {
	const prices = buildPriceMap(marketSnapshots, cashSymbol, {
		accumulateSymbol,
	});
	const priceUsd = prices[fill.symbol];
	if (priceUsd === undefined) {
		throw new Error(`No fresh price for ${fill.symbol}`);
	}

	const quoteUsd = fill.quantity * fill.priceUsd;
	if (fill.side === "buy") {
		return {
			...fill,
			priceUsd,
			quantity: quoteUsd / priceUsd,
		};
	}

	return {
		...fill,
		priceUsd,
	};
}
