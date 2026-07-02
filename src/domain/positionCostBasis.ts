import { computeReturnFraction } from "@/domain/accumulateBenchmark.js";
import type { StoredTrade } from "@/schemas/Trade.js";

function compareTradesChronologically(
	left: StoredTrade,
	right: StoredTrade,
): number {
	const timeDiff = left.createdAt.getTime() - right.createdAt.getTime();
	if (timeDiff !== 0) {
		return timeDiff;
	}
	return left.id - right.id;
}

/** Average-cost basis for an open position from chronological trade history. */
export function computePositionCostBasisUsd(
	trades: readonly StoredTrade[],
	symbol: string,
): number {
	let quantity = 0;
	let costBasisUsd = 0;

	for (const trade of [...trades]
		.filter((entry) => entry.symbol === symbol)
		.sort(compareTradesChronologically)) {
		if (trade.side === "buy") {
			quantity += trade.quantity;
			costBasisUsd += trade.quoteValueUsd;
			continue;
		}

		if (quantity <= 0) {
			continue;
		}

		const sellQuantity = Math.min(trade.quantity, quantity);
		const costFraction = sellQuantity / quantity;
		costBasisUsd -= costBasisUsd * costFraction;
		quantity -= sellQuantity;
	}

	return costBasisUsd;
}

export function computePositionReturnPct(
	currentUsdValue: number,
	costBasisUsd: number,
): number {
	if (costBasisUsd <= 0) {
		return 0;
	}

	return computeReturnFraction(currentUsdValue, costBasisUsd) * 100;
}
