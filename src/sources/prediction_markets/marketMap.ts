import type { PolymarketEventQuery } from "@/sources/prediction_markets/polymarketClient.js";

/**
 * Maps a tradeable asset symbol to the prediction-market lookups used to find a
 * ~24h directional signal on each venue.
 *
 * Verified against live data (Jun 2026): both venues list "≥ strike" threshold
 * ladders rather than direct up/down markets. Kalshi uses daily series (e.g.
 * `KXBTCD`); Polymarket groups each day's ladder under a Gamma event titled
 * "<Asset> above ___ on <date>?" (tag `crypto`). The at-the-money rung (strike
 * nearest spot) gives the directional read. Wrong/stale values degrade
 * gracefully — the source reports "no signal" rather than erroring.
 */
export type PredictionMarketMapping = {
	/** Kalshi series ticker (e.g. daily Bitcoin up/down). Omit if unavailable. */
	kalshiSeriesTicker?: string;
	/** Gamma `/events` discovery for the asset's daily threshold ladder. */
	polymarketEvent?: PolymarketEventQuery;
};

export const PREDICTION_MARKET_MAP: Record<string, PredictionMarketMapping> = {
	BTC: {
		kalshiSeriesTicker: "KXBTCD",
		polymarketEvent: { tagSlug: "crypto", titlePrefix: "bitcoin above" },
	},
	ETH: {
		kalshiSeriesTicker: "KXETHD",
		polymarketEvent: { tagSlug: "crypto", titlePrefix: "ethereum above" },
	},
	SOL: {
		kalshiSeriesTicker: "KXSOLD",
		polymarketEvent: { tagSlug: "crypto", titlePrefix: "solana above" },
	},
};

export function getPredictionMarketMapping(
	symbol: string,
): PredictionMarketMapping | undefined {
	return PREDICTION_MARKET_MAP[symbol];
}
