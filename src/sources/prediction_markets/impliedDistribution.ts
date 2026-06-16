/**
 * Venue-agnostic scoring for "above $X" threshold ladders.
 *
 * Each rung is a cumulative probability `P(price > strike)`, which decreases as
 * the strike rises. Reading a single rung is brittle (it pins near 0/1 when spot
 * sits just off a coarse strike). Instead we reconstruct the implied probability
 * distribution from several rungs near spot: the mass the market assigns to the
 * interval `[Xᵢ, Xᵢ₊₁]` is `P(>Xᵢ) − P(>Xᵢ₊₁)`. The bucket with the most mass is
 * the market's most likely landing zone (the implied mode); its distance from
 * spot, normalized, becomes a directional score in [0,1] (0.5 = neutral).
 */

export type LadderRung = {
	/** Strike price in USD that defines the "above $strike" market. */
	strikeUsd: number;
	/** Cumulative implied probability that price ends above the strike, in [0,1]. */
	probabilityAbove: number;
	/** Liquidity proxy in USD used to filter thin rungs. */
	liquidityUsd: number;
	/** Opaque venue identifier for the rung (for audit/marketRef). */
	marketRef: string;
};

export type LadderScoringOptions = {
	/** Percentage gap from spot (e.g. 0.05 = ±5%) mapped to the [0,1] extremes. */
	normalizationBandPct: number;
	/** Maximum rungs nearest spot used to build the distribution. */
	maxRungs: number;
	/** Minimum rungs required to produce a score (else null). */
	minRungs: number;
	/** Liquidity floor (USD); falls back to all usable rungs if too few clear it. */
	minRungLiquidityUsd: number;
};

export type ModeBucket = {
	lowerStrikeUsd: number;
	upperStrikeUsd: number;
	midpointUsd: number;
	mass: number;
	/** Ref of the lower-strike rung of the bucket. */
	marketRef: string;
};

export type LadderScore = {
	/** Directional score in [0,1]; 0.5 = neutral, >0.5 bullish, <0.5 bearish. */
	score: number;
	/** Midpoint of the highest-probability bucket (the implied mode strike). */
	modeStrikeUsd: number;
	/** Probability mass held by the mode bucket. */
	modeBucketProbability: number;
	/** Spot price used for normalization. */
	spotUsd: number;
	/** Ref of the mode bucket's lower-strike rung. */
	marketRef: string;
	/** Sum of selected rungs' liquidity (ladder depth). */
	liquidityUsd: number;
	/** Number of rungs used to build the distribution. */
	selectedRungs: number;
};

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function isUsableRung(rung: LadderRung): boolean {
	return (
		Number.isFinite(rung.strikeUsd) &&
		rung.strikeUsd > 0 &&
		Number.isFinite(rung.probabilityAbove) &&
		rung.probabilityAbove >= 0 &&
		rung.probabilityAbove <= 1
	);
}

/**
 * Pick the rungs nearest spot to build the distribution. Prefers rungs clearing
 * the liquidity floor; if fewer than `minRungs` qualify, falls back to all
 * usable rungs (best-effort on a thin day). Returns the chosen rungs sorted
 * ascending by strike (the order the bucket math expects).
 */
export function selectRungsNearSpot(
	rungs: readonly LadderRung[],
	spotUsd: number,
	options: LadderScoringOptions,
): LadderRung[] {
	const usable = rungs.filter(isUsableRung);

	const liquid = usable.filter(
		(rung) => rung.liquidityUsd >= options.minRungLiquidityUsd,
	);
	const pool = liquid.length >= options.minRungs ? liquid : usable;

	return pool
		.map((rung) => ({ rung, distance: Math.abs(rung.strikeUsd - spotUsd) }))
		.sort((a, b) => a.distance - b.distance)
		.slice(0, options.maxRungs)
		.map((entry) => entry.rung)
		.sort((a, b) => a.strikeUsd - b.strikeUsd);
}

/**
 * Find the adjacent-rung bucket holding the most probability mass. Rungs must be
 * sorted ascending by strike. Negative masses (non-monotonic noise) are clamped
 * to zero. Returns null when there are fewer than two rungs or no positive mass.
 */
export function computeModeBucket(
	sortedRungs: readonly LadderRung[],
): ModeBucket | null {
	if (sortedRungs.length < 2) {
		return null;
	}

	let best: ModeBucket | null = null;
	for (let i = 0; i < sortedRungs.length - 1; i += 1) {
		const lower = sortedRungs[i] as LadderRung;
		const upper = sortedRungs[i + 1] as LadderRung;
		const mass = Math.max(0, lower.probabilityAbove - upper.probabilityAbove);

		if (best === null || mass > best.mass) {
			best = {
				lowerStrikeUsd: lower.strikeUsd,
				upperStrikeUsd: upper.strikeUsd,
				midpointUsd: (lower.strikeUsd + upper.strikeUsd) / 2,
				mass,
				marketRef: lower.marketRef,
			};
		}
	}

	if (best === null || best.mass <= 0) {
		return null;
	}

	return best;
}

/**
 * Map the mode strike's percentage difference from spot onto [0,1], with
 * 0.5 = at spot and ±`bandPct` reaching the extremes (clamped beyond).
 */
export function directionScoreFromMode(
	modeStrikeUsd: number,
	spotUsd: number,
	bandPct: number,
): number {
	const pctDiff = (modeStrikeUsd - spotUsd) / spotUsd;
	return clamp01(0.5 + (pctDiff / bandPct) * 0.5);
}

/**
 * Build the implied distribution from rungs near spot and return a normalized
 * directional score. Returns null when spot is non-positive, too few rungs are
 * usable, or the distribution carries no mass (all graceful "no signal" cases).
 */
export function scoreLadder(
	rungs: readonly LadderRung[],
	spotUsd: number,
	options: LadderScoringOptions,
): LadderScore | null {
	if (!Number.isFinite(spotUsd) || spotUsd <= 0) {
		return null;
	}

	const selected = selectRungsNearSpot(rungs, spotUsd, options);
	if (selected.length < options.minRungs) {
		return null;
	}

	const mode = computeModeBucket(selected);
	if (mode === null) {
		return null;
	}

	const liquidityUsd = selected.reduce(
		(total, rung) => total + rung.liquidityUsd,
		0,
	);

	return {
		score: directionScoreFromMode(
			mode.midpointUsd,
			spotUsd,
			options.normalizationBandPct,
		),
		modeStrikeUsd: mode.midpointUsd,
		modeBucketProbability: mode.mass,
		spotUsd,
		marketRef: mode.marketRef,
		liquidityUsd,
		selectedRungs: selected.length,
	};
}
