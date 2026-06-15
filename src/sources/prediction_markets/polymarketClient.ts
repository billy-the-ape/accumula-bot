import {
	PolymarketGammaEventsResponseSchema,
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

/** Parse the first USD amount from text (e.g. "$68,000", "$1m") to a number. */
function parseUsdAmount(text: string): number | null {
	const match = text.match(/\$\s?([\d,]+(?:\.\d+)?)\s*([kKmM])?/);
	if (!match?.[1]) {
		return null;
	}
	let value = Number(match[1].replace(/,/g, ""));
	if (!Number.isFinite(value)) {
		return null;
	}
	const suffix = match[2]?.toLowerCase();
	if (suffix === "k") {
		value *= 1_000;
	} else if (suffix === "m") {
		value *= 1_000_000;
	}
	return value;
}

/**
 * Strike for a threshold market ("...above $X..."), parsed from the question.
 * Returns null for genuine up/down markets that have no price threshold.
 */
export function getPolymarketStrike(
	market: PolymarketGammaMarket,
): number | null {
	return parseUsdAmount(market.question ?? "");
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

export type PolymarketEventQuery = {
	/** Gamma tag slug. Only works on `/events` (it is ignored on `/markets`). */
	tagSlug: string;
	/**
	 * Case-insensitive prefix of the event title that selects the asset's daily
	 * threshold ladder, e.g. "bitcoin above" matches "Bitcoin above ___ on
	 * June 16?" while excluding "o1 FDV above ___…" and other assets.
	 */
	titlePrefix: string;
};

/**
 * Discover an asset's threshold-ladder markets via Gamma `/events`. BTC/ETH/SOL
 * price markets are grouped under daily events titled "<Asset> above ___ on
 * <date>?"; each child market is a "above $X" rung. We order by 24h volume so
 * the active daily ladders surface (the default ordering buries them), match
 * events by title prefix, and flatten their child markets for ATM selection.
 */
export async function fetchPolymarketEventMarkets(
	options: PolymarketClientOptions,
	query: PolymarketEventQuery,
): Promise<PolymarketGammaMarket[]> {
	const params = new URLSearchParams({
		active: "true",
		closed: "false",
		limit: "100",
		order: "volume24hr",
		ascending: "false",
		tag_slug: query.tagSlug,
	});

	const url = new URL(
		`events?${params.toString()}`,
		`${options.gammaBaseUrl}/`,
	);
	const events = await fetchJson(
		options,
		url,
		PolymarketGammaEventsResponseSchema,
	);

	const prefix = query.titlePrefix.toLowerCase();
	return events
		.filter(
			(event) =>
				event.closed !== true &&
				(event.title ?? "").toLowerCase().startsWith(prefix),
		)
		.flatMap((event) => event.markets ?? []);
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

export type AtmSelectionParams = {
	nowMs: number;
	targetHorizonHours: number;
	spotPriceUsd: number;
	minHorizonHours?: number;
	maxHorizonHours?: number;
};

/**
 * Select the at-the-money rung for an up/down signal: among open,
 * orderbook-enabled markets within the horizon window, pick the expiry nearest
 * the target, prefer rungs with liquidity, then choose the strike closest to
 * current spot. The YES price of that ~spot strike approximates P(price ends
 * higher than now). Genuine up/down markets (no parseable strike) are treated
 * as perfectly at-the-money and always preferred. Returns null when nothing
 * qualifies — required for Polymarket BTC/ETH markets, which are "above $X"
 * thresholds rather than direct up/down questions.
 */
export function selectAtmMarket(
	markets: readonly PolymarketGammaMarket[],
	params: AtmSelectionParams,
): PolymarketGammaMarket | null {
	const { nowMs, targetHorizonHours, spotPriceUsd } = params;
	const minMs = nowMs + (params.minHorizonHours ?? 0) * HOUR_MS;
	const maxMs =
		params.maxHorizonHours === undefined
			? Number.POSITIVE_INFINITY
			: nowMs + params.maxHorizonHours * HOUR_MS;
	const targetMs = nowMs + targetHorizonHours * HOUR_MS;

	const candidates = markets.filter((market) => {
		if (market.closed === true || market.enableOrderBook === false) {
			return false;
		}
		const endMs = market.endDate ? Date.parse(market.endDate) : Number.NaN;
		return (
			!Number.isNaN(endMs) &&
			endMs > nowMs &&
			endMs >= minMs &&
			endMs <= maxMs &&
			getYesTokenId(market) !== null &&
			getGammaYesPrice(market) !== null &&
			getMarketRef(market) !== null
		);
	});

	if (candidates.length === 0) {
		return null;
	}

	// Expiry nearest the target horizon, then restrict to that expiry's ladder.
	const nearest = candidates.reduce((best, market) => {
		const bestDelta = Math.abs(Date.parse(best.endDate ?? "") - targetMs);
		const marketDelta = Math.abs(Date.parse(market.endDate ?? "") - targetMs);
		return marketDelta < bestDelta ? market : best;
	});
	const expiryMs = Date.parse(nearest.endDate ?? "");
	const sameExpiry = candidates.filter(
		(market) => Date.parse(market.endDate ?? "") === expiryMs,
	);

	// Prefer rungs that have liquidity; fall back to all if none are liquid.
	const liquid = sameExpiry.filter((market) => getLiquidityUsd(market) > 0);
	const pool = liquid.length > 0 ? liquid : sameExpiry;

	// At-the-money: strike closest to spot. No-strike (true up/down) markets get
	// a sentinel distance of -1 so they always win.
	return pool
		.map((market) => {
			const strike = getPolymarketStrike(market);
			return {
				market,
				distance: strike === null ? -1 : Math.abs(strike - spotPriceUsd),
			};
		})
		.reduce((best, current) =>
			current.distance < best.distance ? current : best,
		).market;
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
	/**
	 * Event-based discovery (preferred): finds the asset's threshold ladder via
	 * Gamma `/events`. Takes precedence over `query` when set.
	 */
	event?: PolymarketEventQuery;
	/** Legacy `/markets` filters. Used only when `event` is not provided. */
	query?: Record<string, string>;
	targetHorizonHours?: number;
	now?: Date;
	/**
	 * Current spot price. When provided, the at-the-money rung (strike closest
	 * to spot) is selected so the YES price approximates an up-probability —
	 * required for "above $X" threshold markets. Without it, the market nearest
	 * the target horizon is used (only correct for true up/down markets).
	 */
	spotPriceUsd?: number;
	minHorizonHours?: number;
	maxHorizonHours?: number;
};

/**
 * Discover BTC/ETH markets via Gamma, then return a normalized prediction
 * signal. With `spotPriceUsd`, selects the at-the-money rung (for "above $X"
 * threshold markets); otherwise the market nearest the target horizon. The YES
 * price uses the freshest CLOB midpoint, falling back to the Gamma outcome
 * price. Returns null when no suitable market is open (graceful degradation).
 */
export async function fetchPolymarketSignal(
	options: PolymarketClientOptions,
	params: FetchPolymarketSignalParams,
): Promise<PredictionSignal | null> {
	const now = params.now ?? new Date();
	const targetHorizonHours =
		params.targetHorizonHours ?? DEFAULT_TARGET_HORIZON_HOURS;

	const markets = params.event
		? await fetchPolymarketEventMarkets(options, params.event)
		: await fetchPolymarketMarkets(options, params.query ?? {});
	const market =
		params.spotPriceUsd === undefined
			? selectMarketNearestHorizon(markets, now.getTime(), targetHorizonHours)
			: selectAtmMarket(markets, {
					nowMs: now.getTime(),
					targetHorizonHours,
					spotPriceUsd: params.spotPriceUsd,
					...(params.minHorizonHours !== undefined
						? { minHorizonHours: params.minHorizonHours }
						: {}),
					...(params.maxHorizonHours !== undefined
						? { maxHorizonHours: params.maxHorizonHours }
						: {}),
				});

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
