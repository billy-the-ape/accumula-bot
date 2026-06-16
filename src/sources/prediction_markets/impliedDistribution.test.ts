import { describe, expect, it } from "vitest";
import {
	computeModeBucket,
	directionScoreFromMode,
	type LadderRung,
	scoreLadder,
	selectRungsNearSpot,
} from "@/sources/prediction_markets/impliedDistribution.js";

function rung(
	strikeUsd: number,
	probabilityAbove: number,
	liquidityUsd = 5_000,
): LadderRung {
	return {
		strikeUsd,
		probabilityAbove,
		liquidityUsd,
		marketRef: `ref-${strikeUsd}`,
	};
}

const defaultOpts = {
	normalizationBandPct: 0.05,
	maxRungs: 6,
	minRungs: 3,
	minRungLiquidityUsd: 1_000,
};

describe("directionScoreFromMode", () => {
	it("returns 0.5 when the mode strike equals spot", () => {
		expect(directionScoreFromMode(100, 100, 0.05)).toBe(0.5);
	});

	it("returns 1.0 when the mode strike is a full band above spot", () => {
		expect(directionScoreFromMode(105, 100, 0.05)).toBe(1);
	});

	it("returns 0.0 when the mode strike is a full band below spot", () => {
		expect(directionScoreFromMode(95, 100, 0.05)).toBe(0);
	});

	it("clamps beyond the band", () => {
		expect(directionScoreFromMode(120, 100, 0.05)).toBe(1);
		expect(directionScoreFromMode(80, 100, 0.05)).toBe(0);
	});

	it("maps a half-band move linearly", () => {
		expect(directionScoreFromMode(102.5, 100, 0.05)).toBeCloseTo(0.75, 10);
		expect(directionScoreFromMode(97.5, 100, 0.05)).toBeCloseTo(0.25, 10);
	});
});

describe("computeModeBucket", () => {
	it("returns the adjacent bucket holding the most probability mass", () => {
		const bucket = computeModeBucket([
			rung(95, 0.9),
			rung(100, 0.8),
			rung(105, 0.3),
			rung(110, 0.2),
		]);
		expect(bucket).not.toBeNull();
		expect(bucket?.lowerStrikeUsd).toBe(100);
		expect(bucket?.upperStrikeUsd).toBe(105);
		expect(bucket?.midpointUsd).toBe(102.5);
		expect(bucket?.mass).toBeCloseTo(0.5, 10);
		expect(bucket?.marketRef).toBe("ref-100");
	});

	it("clamps negative mass from non-monotonic noise to zero", () => {
		// The 100->105 step rises (noise); its mass must not be chosen.
		const bucket = computeModeBucket([
			rung(95, 0.6),
			rung(100, 0.4),
			rung(105, 0.5),
			rung(110, 0.1),
		]);
		expect(bucket?.lowerStrikeUsd).toBe(105);
		expect(bucket?.upperStrikeUsd).toBe(110);
		expect(bucket?.mass).toBeCloseTo(0.4, 10);
	});

	it("returns null when every bucket has zero mass", () => {
		expect(
			computeModeBucket([rung(95, 0.5), rung(100, 0.5), rung(105, 0.5)]),
		).toBeNull();
	});

	it("returns null with fewer than two rungs", () => {
		expect(computeModeBucket([rung(100, 0.5)])).toBeNull();
	});
});

describe("selectRungsNearSpot", () => {
	it("keeps the rungs nearest spot up to maxRungs, sorted ascending by strike", () => {
		const selected = selectRungsNearSpot(
			[
				rung(80, 0.9),
				rung(90, 0.8),
				rung(100, 0.6),
				rung(110, 0.4),
				rung(120, 0.2),
			],
			100,
			{ ...defaultOpts, maxRungs: 3 },
		);
		expect(selected.map((r) => r.strikeUsd)).toEqual([90, 100, 110]);
	});

	it("keeps only rungs clearing the liquidity floor when enough qualify", () => {
		const selected = selectRungsNearSpot(
			[
				rung(95, 0.8, 5_000),
				rung(100, 0.6, 200), // illiquid
				rung(105, 0.4, 5_000),
				rung(110, 0.2, 5_000),
			],
			100,
			defaultOpts,
		);
		expect(selected.map((r) => r.strikeUsd)).toEqual([95, 105, 110]);
	});

	it("falls back to all usable rungs when too few clear the liquidity floor", () => {
		const selected = selectRungsNearSpot(
			[
				rung(95, 0.8, 200),
				rung(100, 0.6, 5_000),
				rung(105, 0.4, 200),
				rung(110, 0.2, 200),
			],
			100,
			defaultOpts,
		);
		expect(selected.map((r) => r.strikeUsd)).toEqual([95, 100, 105, 110]);
	});

	it("drops rungs with an out-of-range probability", () => {
		const selected = selectRungsNearSpot(
			[rung(95, 0.8), rung(100, 1.4), rung(105, 0.4), rung(110, 0.2)],
			100,
			defaultOpts,
		);
		expect(selected.map((r) => r.strikeUsd)).toEqual([95, 105, 110]);
	});
});

describe("scoreLadder", () => {
	it("scores a bullish skew (mode above spot) above 0.5", () => {
		const result = scoreLadder(
			[rung(95, 0.9), rung(100, 0.8), rung(105, 0.3), rung(110, 0.2)],
			100,
			defaultOpts,
		);
		expect(result).not.toBeNull();
		expect(result?.modeStrikeUsd).toBe(102.5);
		expect(result?.score).toBeCloseTo(0.75, 10);
		expect(result?.spotUsd).toBe(100);
		expect(result?.modeBucketProbability).toBeCloseTo(0.5, 10);
		expect(result?.marketRef).toBe("ref-100");
		expect(result?.selectedRungs).toBe(4);
		expect(result?.liquidityUsd).toBe(20_000);
	});

	it("scores a bearish skew (mode below spot) below 0.5", () => {
		const result = scoreLadder(
			[rung(90, 0.8), rung(95, 0.7), rung(100, 0.2), rung(105, 0.1)],
			100,
			defaultOpts,
		);
		expect(result?.modeStrikeUsd).toBe(97.5);
		expect(result?.score).toBeCloseTo(0.25, 10);
	});

	it("scores 0.5 when the mode bucket straddles spot symmetrically", () => {
		const result = scoreLadder(
			[rung(90, 0.85), rung(95, 0.8), rung(105, 0.2), rung(110, 0.15)],
			100,
			defaultOpts,
		);
		expect(result?.modeStrikeUsd).toBe(100);
		expect(result?.score).toBe(0.5);
	});

	it("returns null when fewer than minRungs are usable", () => {
		const result = scoreLadder(
			[rung(95, 0.8), rung(105, 0.4)],
			100,
			defaultOpts,
		);
		expect(result).toBeNull();
	});

	it("returns null when spot is not positive", () => {
		const result = scoreLadder(
			[rung(95, 0.9), rung(100, 0.8), rung(105, 0.3)],
			0,
			defaultOpts,
		);
		expect(result).toBeNull();
	});

	it("returns null when every bucket has zero mass", () => {
		const result = scoreLadder(
			[rung(95, 0.5), rung(100, 0.5), rung(105, 0.5)],
			100,
			defaultOpts,
		);
		expect(result).toBeNull();
	});
});
