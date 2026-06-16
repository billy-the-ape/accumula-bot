import {
	type KalshiMarket,
	KalshiMarketsResponseSchema,
} from "@/schemas/KalshiMarket.js";
import {
	type PredictionSignal,
	PredictionSignalSchema,
} from "@/schemas/PredictionSignal.js";
import {
	type LadderRung,
	type LadderScore,
	type LadderScoringOptions,
	scoreLadder,
} from "@/sources/prediction_markets/impliedDistribution.js";

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_TARGET_HORIZON_HOURS = 24;

export const DEFAULT_KALSHI_LADDER_SCORING: LadderScoringOptions = {
	normalizationBandPct: 0.05,
	maxRungs: 6,
	minRungs: 3,
	minRungLiquidityUsd: 1_000,
};

export class KalshiError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "KalshiError";
	}
}

export type KalshiClientOptions = {
	baseUrl: string;
	fetchImpl?: typeof fetch;
};

function normalizeProbability(value: number): number {
	const clamped = Math.min(1, Math.max(0, value));
	return Math.round(clamped * 10_000) / 10_000;
}

// `liquidity_dollars` is deprecated (always "0.0000"), so use 24h traded value
// (contracts * notional) as a liquidity proxy.
export function computeLiquidityUsd(market: KalshiMarket): number {
	return Math.max(0, market.volume_24h_fp * market.notional_value_dollars);
}

async function fetchJson<T>(
	options: KalshiClientOptions,
	path: string,
	schema: { parse: (value: unknown) => T },
): Promise<T> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const url = new URL(path, `${options.baseUrl}/`);

	let response: Response;
	try {
		response = await fetchImpl(url);
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown error";
		throw new KalshiError(
			`Failed to reach Kalshi at ${url.origin}: ${message}`,
		);
	}

	if (!response.ok) {
		const body = await response.text();
		throw new KalshiError(
			`Kalshi request failed (${response.status}): ${body || response.statusText}`,
		);
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw new KalshiError("Kalshi returned a non-JSON response body");
	}

	try {
		return schema.parse(payload);
	} catch (error) {
		const message = error instanceof Error ? error.message : "invalid payload";
		throw new KalshiError(`Kalshi response validation failed: ${message}`);
	}
}

export async function fetchKalshiMarkets(
	options: KalshiClientOptions,
	seriesTicker: string,
	status = "open",
): Promise<KalshiMarket[]> {
	const params = new URLSearchParams({
		series_ticker: seriesTicker,
		status,
		limit: "100",
	});

	const response = await fetchJson(
		options,
		`markets?${params.toString()}`,
		KalshiMarketsResponseSchema,
	);

	return response.markets;
}

/**
 * Implied probability that the YES side resolves true, derived from top-of-book.
 * For an "above $X" rung this is P(price > strike). Returns null when the market
 * has no usable price (thin/illiquid book and no trades).
 */
export function deriveImpliedUpProbability(
	market: KalshiMarket,
): number | null {
	const bid = market.yes_bid_dollars;
	const ask = market.yes_ask_dollars;
	const last = market.last_price_dollars;

	if (bid > 0 && ask > 0) {
		return normalizeProbability((bid + ask) / 2);
	}
	if (last > 0) {
		return normalizeProbability(last);
	}
	if (bid > 0) {
		return normalizeProbability(bid);
	}
	if (ask > 0) {
		return normalizeProbability(ask);
	}
	return null;
}

/**
 * Strike that defines a "≥ strike" / range market. Prefers the structured
 * `floor_strike`/`cap_strike` fields, falling back to parsing the `-T<strike>`
 * suffix from the ticker. Returns null when no strike can be determined.
 */
export function getKalshiStrike(market: KalshiMarket): number | null {
	const { floor_strike, cap_strike } = market;
	if (floor_strike != null && cap_strike != null) {
		return (floor_strike + cap_strike) / 2;
	}
	if (floor_strike != null) {
		return floor_strike;
	}
	if (cap_strike != null) {
		return cap_strike;
	}

	const raw = market.ticker.match(/-T([0-9.]+)/)?.[1];
	if (raw === undefined) {
		return null;
	}
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : null;
}

export function kalshiMarketToLadderRung(
	market: KalshiMarket,
): LadderRung | null {
	const strikeUsd = getKalshiStrike(market);
	const probabilityAbove = deriveImpliedUpProbability(market);
	if (strikeUsd === null || probabilityAbove === null) {
		return null;
	}

	return {
		strikeUsd,
		probabilityAbove,
		liquidityUsd: computeLiquidityUsd(market),
		marketRef: market.ticker,
	};
}

export type HorizonSelectionParams = {
	nowMs: number;
	targetHorizonHours: number;
	minHorizonHours?: number;
	maxHorizonHours?: number;
};

/**
 * Return all open ladder rungs at the expiry nearest `now + targetHorizonHours`.
 * Markets without a parseable strike or usable YES price are excluded.
 */
export function selectMarketsAtHorizon(
	markets: readonly KalshiMarket[],
	params: HorizonSelectionParams,
): KalshiMarket[] {
	const { nowMs, targetHorizonHours } = params;
	const minMs = nowMs + (params.minHorizonHours ?? 0) * HOUR_MS;
	const maxMs =
		params.maxHorizonHours === undefined
			? Number.POSITIVE_INFINITY
			: nowMs + params.maxHorizonHours * HOUR_MS;
	const targetMs = nowMs + targetHorizonHours * HOUR_MS;

	const candidates = markets.filter((market) => {
		const closeMs = Date.parse(market.close_time);
		return (
			!Number.isNaN(closeMs) &&
			closeMs > nowMs &&
			closeMs >= minMs &&
			closeMs <= maxMs &&
			deriveImpliedUpProbability(market) !== null &&
			getKalshiStrike(market) !== null
		);
	});

	if (candidates.length === 0) {
		return [];
	}

	const nearest = candidates.reduce((best, market) => {
		const bestDelta = Math.abs(Date.parse(best.close_time) - targetMs);
		const marketDelta = Math.abs(Date.parse(market.close_time) - targetMs);
		return marketDelta < bestDelta ? market : best;
	});
	const expiryMs = Date.parse(nearest.close_time);

	return candidates.filter(
		(market) => Date.parse(market.close_time) === expiryMs,
	);
}

export function buildKalshiLadderRungs(
	markets: readonly KalshiMarket[],
): LadderRung[] {
	return markets
		.map(kalshiMarketToLadderRung)
		.filter((rung): rung is LadderRung => rung !== null);
}

export function toPredictionSignalFromLadderScore(
	asset: string,
	nowIso: string,
	horizonHours: number,
	ladderScore: LadderScore,
): PredictionSignal {
	return PredictionSignalSchema.parse({
		asset,
		source: "kalshi",
		impliedUpProbability: ladderScore.score,
		horizonHours,
		liquidityUsd: ladderScore.liquidityUsd,
		asOf: nowIso,
		marketRef: ladderScore.marketRef,
		modeStrikeUsd: ladderScore.modeStrikeUsd,
		spotUsd: ladderScore.spotUsd,
		modeBucketProbability: ladderScore.modeBucketProbability,
	});
}

export type FetchKalshiSignalParams = {
	asset: string;
	seriesTicker: string;
	targetHorizonHours?: number;
	now?: Date;
	/** Current spot price — required for implied-distribution scoring. */
	spotPriceUsd: number;
	scoring?: LadderScoringOptions;
	minHorizonHours?: number;
	maxHorizonHours?: number;
};

/**
 * Fetch open markets for a series, build an implied distribution from rungs near
 * spot at the target horizon, and return a normalized directional score. Returns
 * null when spot is missing/invalid, too few rungs qualify, or scoring fails
 * (graceful degradation — absence is not a signal).
 */
export async function fetchKalshiSignal(
	options: KalshiClientOptions,
	params: FetchKalshiSignalParams,
): Promise<PredictionSignal | null> {
	const now = params.now ?? new Date();
	const targetHorizonHours =
		params.targetHorizonHours ?? DEFAULT_TARGET_HORIZON_HOURS;
	const scoring = params.scoring ?? DEFAULT_KALSHI_LADDER_SCORING;

	if (!Number.isFinite(params.spotPriceUsd) || params.spotPriceUsd <= 0) {
		return null;
	}

	const markets = await fetchKalshiMarkets(
		options,
		params.seriesTicker,
		"open",
	);

	const horizonMarkets = selectMarketsAtHorizon(markets, {
		nowMs: now.getTime(),
		targetHorizonHours,
		...(params.minHorizonHours !== undefined
			? { minHorizonHours: params.minHorizonHours }
			: {}),
		...(params.maxHorizonHours !== undefined
			? { maxHorizonHours: params.maxHorizonHours }
			: {}),
	});
	if (horizonMarkets.length === 0) {
		return null;
	}

	const ladderRungs = buildKalshiLadderRungs(horizonMarkets);
	const ladderScore = scoreLadder(ladderRungs, params.spotPriceUsd, scoring);
	if (ladderScore === null) {
		return null;
	}

	const closeTime = horizonMarkets[0]?.close_time;
	const horizonHours =
		closeTime === undefined
			? targetHorizonHours
			: (Date.parse(closeTime) - now.getTime()) / HOUR_MS;

	return toPredictionSignalFromLadderScore(
		params.asset,
		now.toISOString(),
		horizonHours,
		ladderScore,
	);
}
