import {
	PolymarketGammaEventsResponseSchema,
	type PolymarketGammaMarket,
	PolymarketGammaMarketsResponseSchema,
} from "@/schemas/PolymarketMarket.js";
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

export const DEFAULT_POLYMARKET_LADDER_SCORING: LadderScoringOptions = {
	normalizationBandPct: 0.05,
	maxRungs: 6,
	minRungs: 3,
	minRungLiquidityUsd: 1_000,
};

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

export function getLiquidityUsd(market: PolymarketGammaMarket): number {
	const value = market.liquidityNum ?? market.liquidity ?? 0;
	return Math.max(0, value);
}

function isPolymarketLadderCandidate(
	market: PolymarketGammaMarket,
	nowMs: number,
	minMs: number,
	maxMs: number,
): boolean {
	if (market.closed === true || market.enableOrderBook === false) {
		return false;
	}

	const endMs = market.endDate ? Date.parse(market.endDate) : Number.NaN;
	return (
		!Number.isNaN(endMs) &&
		endMs > nowMs &&
		endMs >= minMs &&
		endMs <= maxMs &&
		getPolymarketStrike(market) !== null &&
		getGammaYesPrice(market) !== null &&
		getMarketRef(market) !== null
	);
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
 * <date>?"; each child market is a "above $X" rung.
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

export function polymarketMarketToLadderRung(
	market: PolymarketGammaMarket,
): LadderRung | null {
	const strikeUsd = getPolymarketStrike(market);
	const probabilityAbove = getGammaYesPrice(market);
	const marketRef = getMarketRef(market);
	if (strikeUsd === null || probabilityAbove === null || marketRef === null) {
		return null;
	}

	return {
		strikeUsd,
		probabilityAbove,
		liquidityUsd: getLiquidityUsd(market),
		marketRef,
	};
}

export function buildPolymarketLadderRungs(
	markets: readonly PolymarketGammaMarket[],
): LadderRung[] {
	return markets
		.map(polymarketMarketToLadderRung)
		.filter((rung): rung is LadderRung => rung !== null);
}

export type HorizonSelectionParams = {
	nowMs: number;
	targetHorizonHours: number;
	minHorizonHours?: number;
	maxHorizonHours?: number;
};

/**
 * Return all threshold-ladder rungs at the expiry nearest `now + targetHorizonHours`.
 */
export function selectMarketsAtHorizon(
	markets: readonly PolymarketGammaMarket[],
	params: HorizonSelectionParams,
): PolymarketGammaMarket[] {
	const { nowMs, targetHorizonHours } = params;
	const minMs = nowMs + (params.minHorizonHours ?? 0) * HOUR_MS;
	const maxMs =
		params.maxHorizonHours === undefined
			? Number.POSITIVE_INFINITY
			: nowMs + params.maxHorizonHours * HOUR_MS;
	const targetMs = nowMs + targetHorizonHours * HOUR_MS;

	const candidates = markets.filter((market) =>
		isPolymarketLadderCandidate(market, nowMs, minMs, maxMs),
	);

	if (candidates.length === 0) {
		return [];
	}

	const nearest = candidates.reduce((best, market) => {
		const bestDelta = Math.abs(Date.parse(best.endDate ?? "") - targetMs);
		const marketDelta = Math.abs(Date.parse(market.endDate ?? "") - targetMs);
		return marketDelta < bestDelta ? market : best;
	});
	const expiryMs = Date.parse(nearest.endDate ?? "");

	return candidates.filter(
		(market) => Date.parse(market.endDate ?? "") === expiryMs,
	);
}

export function toPredictionSignalFromLadderScore(
	asset: string,
	nowIso: string,
	horizonHours: number,
	ladderScore: LadderScore,
): PredictionSignal {
	return PredictionSignalSchema.parse({
		asset,
		source: "polymarket",
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
	/** Current spot price — required for implied-distribution scoring. */
	spotPriceUsd: number;
	scoring?: LadderScoringOptions;
	minHorizonHours?: number;
	maxHorizonHours?: number;
};

/**
 * Discover threshold-ladder markets via Gamma, build an implied distribution
 * from rungs near spot at the target horizon, and return a normalized directional
 * score. Uses bulk Gamma `outcomePrices` (no per-rung CLOB calls). Returns null
 * when spot is missing/invalid, too few rungs qualify, or scoring fails.
 */
export async function fetchPolymarketSignal(
	options: PolymarketClientOptions,
	params: FetchPolymarketSignalParams,
): Promise<PredictionSignal | null> {
	const now = params.now ?? new Date();
	const targetHorizonHours =
		params.targetHorizonHours ?? DEFAULT_TARGET_HORIZON_HOURS;
	const scoring = params.scoring ?? DEFAULT_POLYMARKET_LADDER_SCORING;

	if (!Number.isFinite(params.spotPriceUsd) || params.spotPriceUsd <= 0) {
		return null;
	}

	const markets = params.event
		? await fetchPolymarketEventMarkets(options, params.event)
		: await fetchPolymarketMarkets(options, params.query ?? {});

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

	const ladderRungs = buildPolymarketLadderRungs(horizonMarkets);
	const ladderScore = scoreLadder(ladderRungs, params.spotPriceUsd, scoring);
	if (ladderScore === null) {
		return null;
	}

	const endDate = horizonMarkets[0]?.endDate;
	const horizonHours =
		endDate === undefined
			? targetHorizonHours
			: (Date.parse(endDate) - now.getTime()) / HOUR_MS;

	return toPredictionSignalFromLadderScore(
		params.asset,
		now.toISOString(),
		horizonHours,
		ladderScore,
	);
}
