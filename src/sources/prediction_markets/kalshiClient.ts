import {
	type KalshiMarket,
	KalshiMarketsResponseSchema,
} from "@/schemas/KalshiMarket.js";
import {
	type PredictionSignal,
	PredictionSignalSchema,
} from "@/schemas/PredictionSignal.js";

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_TARGET_HORIZON_HOURS = 24;

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
 * For an "up or down" market this is the probability of "up". Returns null when
 * the market has no usable price (thin/illiquid book and no trades).
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
 * Pick the open, still-tradeable market whose close time is closest to
 * `now + targetHorizonHours`. Markets that already closed or have no usable
 * price are ignored. Returns null when nothing qualifies.
 */
export function selectMarketNearestHorizon(
	markets: readonly KalshiMarket[],
	nowMs: number,
	targetHorizonHours: number,
): KalshiMarket | null {
	const targetMs = nowMs + targetHorizonHours * HOUR_MS;

	const candidates = markets.filter((market) => {
		const closeMs = Date.parse(market.close_time);
		return (
			!Number.isNaN(closeMs) &&
			closeMs > nowMs &&
			deriveImpliedUpProbability(market) !== null
		);
	});

	if (candidates.length === 0) {
		return null;
	}

	return candidates.reduce((best, market) => {
		const bestDelta = Math.abs(Date.parse(best.close_time) - targetMs);
		const marketDelta = Math.abs(Date.parse(market.close_time) - targetMs);
		return marketDelta < bestDelta ? market : best;
	});
}

export function toPredictionSignal(
	market: KalshiMarket,
	params: { asset: string; nowIso: string },
): PredictionSignal {
	const impliedUpProbability = deriveImpliedUpProbability(market);
	if (impliedUpProbability === null) {
		throw new KalshiError(`Kalshi market ${market.ticker} has no usable price`);
	}

	const horizonHours =
		(Date.parse(market.close_time) - Date.parse(params.nowIso)) / HOUR_MS;

	// `liquidity_dollars` is deprecated (always "0.0000"), so use 24h traded
	// value (contracts * $1 notional) as a liquidity proxy.
	const liquidityUsd = Math.max(
		0,
		market.volume_24h_fp * market.notional_value_dollars,
	);

	return PredictionSignalSchema.parse({
		asset: params.asset,
		source: "kalshi",
		impliedUpProbability,
		horizonHours,
		liquidityUsd,
		asOf: params.nowIso,
		marketRef: market.ticker,
	});
}

export type FetchKalshiSignalParams = {
	asset: string;
	seriesTicker: string;
	targetHorizonHours?: number;
	now?: Date;
};

/**
 * Fetch open markets for a series and return the normalized prediction signal
 * for the one nearest the target horizon. Returns null when no suitable market
 * is open (graceful degradation — absence is not a signal).
 */
export async function fetchKalshiSignal(
	options: KalshiClientOptions,
	params: FetchKalshiSignalParams,
): Promise<PredictionSignal | null> {
	const now = params.now ?? new Date();
	const targetHorizonHours =
		params.targetHorizonHours ?? DEFAULT_TARGET_HORIZON_HOURS;

	const markets = await fetchKalshiMarkets(
		options,
		params.seriesTicker,
		"open",
	);
	const market = selectMarketNearestHorizon(
		markets,
		now.getTime(),
		targetHorizonHours,
	);

	if (!market) {
		return null;
	}

	return toPredictionSignal(market, {
		asset: params.asset,
		nowIso: now.toISOString(),
	});
}
