import {
	type PolymarketGammaMarket,
	PolymarketGammaMarketsResponseSchema,
	PolymarketMidpointSchema,
} from "@/schemas/PolymarketMarket.js";
import {
	type PredictionSignal,
	PredictionSignalSchema,
} from "@/schemas/PredictionSignal.js";

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_TARGET_HORIZON_HOURS = 24;

export class PolymarketError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PolymarketError";
	}
}

export type PolymarketClientOptions = {
	gammaBaseUrl: string;
	clobBaseUrl: string;
	fetchImpl?: typeof fetch;
};

function normalizeProbability(value: number): number {
	const clamped = Math.min(1, Math.max(0, value));
	return Math.round(clamped * 10_000) / 10_000;
}

/** Parse a Gamma field that may be a JSON-encoded array string or a real array. */
function parseStringOrArray(value: string | string[] | undefined): string[] {
	if (Array.isArray(value)) {
		return value;
	}
	if (typeof value !== "string") {
		return [];
	}
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
	} catch {
		return [];
	}
}

export function getYesTokenId(market: PolymarketGammaMarket): string | null {
	return parseStringOrArray(market.clobTokenIds)[0] ?? null;
}

export function getGammaYesPrice(market: PolymarketGammaMarket): number | null {
	const raw = parseStringOrArray(market.outcomePrices)[0];
	if (raw === undefined) {
		return null;
	}
	const value = Number(raw);
	return Number.isFinite(value) && value > 0
		? normalizeProbability(value)
		: null;
}

export function getMarketRef(market: PolymarketGammaMarket): string | null {
	return market.conditionId ?? market.slug ?? market.id ?? null;
}

function getLiquidityUsd(market: PolymarketGammaMarket): number {
	const value = market.liquidityNum ?? market.liquidity ?? 0;
	return Math.max(0, value);
}

async function fetchJson<T>(
	options: PolymarketClientOptions,
	url: URL,
	schema: { parse: (value: unknown) => T },
): Promise<T> {
	const fetchImpl = options.fetchImpl ?? fetch;

	let response: Response;
	try {
		response = await fetchImpl(url);
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown error";
		throw new PolymarketError(
			`Failed to reach Polymarket at ${url.origin}: ${message}`,
		);
	}

	if (!response.ok) {
		const body = await response.text();
		throw new PolymarketError(
			`Polymarket request failed (${response.status}): ${body || response.statusText}`,
		);
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw new PolymarketError("Polymarket returned a non-JSON response body");
	}

	try {
		return schema.parse(payload);
	} catch (error) {
		const message = error instanceof Error ? error.message : "invalid payload";
		throw new PolymarketError(
			`Polymarket response validation failed: ${message}`,
		);
	}
}

export async function fetchPolymarketMarkets(
	options: PolymarketClientOptions,
	query: Record<string, string> = {},
): Promise<PolymarketGammaMarket[]> {
	const params = new URLSearchParams({
		active: "true",
		closed: "false",
		limit: "100",
		...query,
	});

	const url = new URL(
		`markets?${params.toString()}`,
		`${options.gammaBaseUrl}/`,
	);

	return fetchJson(options, url, PolymarketGammaMarketsResponseSchema);
}

/**
 * CLOB midpoint (average of best bid/ask) for a token. Returns null when the
 * token has no orderbook (404) or the request otherwise fails — the caller
 * falls back to the Gamma outcome price instead of erroring out.
 */
export async function fetchMidpoint(
	options: PolymarketClientOptions,
	tokenId: string,
): Promise<number | null> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const url = new URL(
		`midpoint?token_id=${encodeURIComponent(tokenId)}`,
		`${options.clobBaseUrl}/`,
	);

	try {
		const response = await fetchImpl(url);
		if (!response.ok) {
			return null;
		}
		const payload = await response.json();
		const { mid_price } = PolymarketMidpointSchema.parse(payload);
		return Number.isFinite(mid_price) && mid_price > 0
			? normalizeProbability(mid_price)
			: null;
	} catch {
		return null;
	}
}

/**
 * Pick the open, orderbook-enabled market whose end date is closest to
 * `now + targetHorizonHours`. Closed/resolved markets, those without a YES
 * token, and those with no usable Gamma price are ignored.
 */
export function selectMarketNearestHorizon(
	markets: readonly PolymarketGammaMarket[],
	nowMs: number,
	targetHorizonHours: number,
): PolymarketGammaMarket | null {
	const targetMs = nowMs + targetHorizonHours * HOUR_MS;

	const candidates = markets.filter((market) => {
		if (market.closed === true || market.enableOrderBook === false) {
			return false;
		}
		const endMs = market.endDate ? Date.parse(market.endDate) : Number.NaN;
		return (
			!Number.isNaN(endMs) &&
			endMs > nowMs &&
			getYesTokenId(market) !== null &&
			getGammaYesPrice(market) !== null &&
			getMarketRef(market) !== null
		);
	});

	if (candidates.length === 0) {
		return null;
	}

	return candidates.reduce((best, market) => {
		const bestDelta = Math.abs(Date.parse(best.endDate ?? "") - targetMs);
		const marketDelta = Math.abs(Date.parse(market.endDate ?? "") - targetMs);
		return marketDelta < bestDelta ? market : best;
	});
}

export function toPredictionSignal(
	market: PolymarketGammaMarket,
	params: { asset: string; nowIso: string; impliedUpProbability: number },
): PredictionSignal {
	const marketRef = getMarketRef(market);
	if (marketRef === null) {
		throw new PolymarketError("Polymarket market has no usable identifier");
	}

	const horizonHours =
		(Date.parse(market.endDate ?? "") - Date.parse(params.nowIso)) / HOUR_MS;

	return PredictionSignalSchema.parse({
		asset: params.asset,
		source: "polymarket",
		impliedUpProbability: params.impliedUpProbability,
		horizonHours,
		liquidityUsd: getLiquidityUsd(market),
		asOf: params.nowIso,
		marketRef,
	});
}

export type FetchPolymarketSignalParams = {
	asset: string;
	query?: Record<string, string>;
	targetHorizonHours?: number;
	now?: Date;
};

/**
 * Discover BTC/ETH "up or down" markets via Gamma, then return a normalized
 * prediction signal for the one nearest the target horizon. The YES price uses
 * the freshest CLOB midpoint, falling back to the Gamma outcome price. Returns
 * null when no suitable market is open (graceful degradation).
 */
export async function fetchPolymarketSignal(
	options: PolymarketClientOptions,
	params: FetchPolymarketSignalParams,
): Promise<PredictionSignal | null> {
	const now = params.now ?? new Date();
	const targetHorizonHours =
		params.targetHorizonHours ?? DEFAULT_TARGET_HORIZON_HOURS;

	const markets = await fetchPolymarketMarkets(options, params.query ?? {});
	const market = selectMarketNearestHorizon(
		markets,
		now.getTime(),
		targetHorizonHours,
	);

	if (!market) {
		return null;
	}

	const tokenId = getYesTokenId(market);
	const midpoint = tokenId ? await fetchMidpoint(options, tokenId) : null;
	const impliedUpProbability = midpoint ?? getGammaYesPrice(market);

	if (impliedUpProbability === null) {
		return null;
	}

	return toPredictionSignal(market, {
		asset: params.asset,
		nowIso: now.toISOString(),
		impliedUpProbability,
	});
}
