import type { PriceMap } from "@/domain/types.js";
import type { MarketSnapshot } from "@/schemas/MarketSnapshot.js";

export function buildPriceMap(
	marketSnapshots: readonly MarketSnapshot[],
	cashSymbol: string,
): PriceMap {
	const prices: Record<string, number> = {
		[cashSymbol]: 1,
	};

	for (const snapshot of marketSnapshots) {
		prices[snapshot.asset] = snapshot.priceUsd;
	}

	return prices;
}
