import {
	getCryptocurrency,
	isKnownCryptocurrencySymbol,
} from "@/config/assets.js";
import type { PriceMap } from "@/domain/types.js";
import type { MarketSnapshot } from "@/schemas/MarketSnapshot.js";

export type BuildPriceMapOptions = {
	/** Ensures a price exists for the accumulation benchmark asset. */
	accumulateSymbol?: string;
};

function ensureAccumulatePrice(
	prices: Record<string, number>,
	accumulateSymbol: string,
	cashSymbol: string,
): void {
	if (prices[accumulateSymbol] !== undefined) {
		return;
	}

	if (accumulateSymbol === cashSymbol) {
		prices[accumulateSymbol] = 1;
		return;
	}

	if (
		isKnownCryptocurrencySymbol(accumulateSymbol) &&
		getCryptocurrency(accumulateSymbol).isStable === true
	) {
		prices[accumulateSymbol] = 1;
	}
}

export function buildPriceMap(
	marketSnapshots: readonly MarketSnapshot[],
	cashSymbol: string,
	options: BuildPriceMapOptions = {},
): PriceMap {
	const prices: Record<string, number> = {
		[cashSymbol]: 1,
	};

	for (const snapshot of marketSnapshots) {
		prices[snapshot.asset] = snapshot.priceUsd;
	}

	if (options.accumulateSymbol) {
		ensureAccumulatePrice(prices, options.accumulateSymbol, cashSymbol);
	}

	return prices;
}
