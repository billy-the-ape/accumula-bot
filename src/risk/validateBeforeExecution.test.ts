import { describe, expect, it } from "vitest";
import { validateBeforeExecution } from "@/risk/validateBeforeExecution.js";
import type { TradeRecommendation } from "@/schemas/TradeRecommendation.js";

const prices = {
	BTC: 100_000,
	ETH: 3_000,
	SOL: 150,
	USDC: 1,
} as const;

const recommendation: TradeRecommendation = {
	rankings: [
		{ asset: "SOL", score: 0.75 },
		{ asset: "ETH", score: 0.65 },
	],
	recommended_asset: "SOL",
	confidence: 0.7,
	reason: "SOL momentum",
};

function baseInput(
	overrides: Partial<Parameters<typeof validateBeforeExecution>[0]> = {},
) {
	return {
		recommendation,
		holdings: { USDC: 10_000 },
		prices,
		tradingEnabled: true,
		dailyBaselineBtcValue: 0.1,
		weeklyBaselineBtcValue: 0.1,
		cashSymbol: "USDC",
		tradeableSymbols: ["BTC", "ETH", "SOL", "USDC"],
		...overrides,
	};
}

describe("validateBeforeExecution", () => {
	it("allows a valid recommendation when portfolio guardrails pass", () => {
		const result = validateBeforeExecution(baseInput());

		expect(result.allowed).toBe(true);
		expect(result.violations).toEqual([]);
	});

	it("blocks trading when the kill switch is off", () => {
		const result = validateBeforeExecution(
			baseInput({ tradingEnabled: false }),
		);

		expect(result.allowed).toBe(false);
		expect(result.violations.map((violation) => violation.code)).toContain(
			"TRADING_DISABLED",
		);
	});

	it("blocks when daily BTC-denominated loss exceeds the limit", () => {
		const result = validateBeforeExecution(
			baseInput({
				holdings: { USDC: 9_400 },
				dailyBaselineBtcValue: 0.1,
			}),
		);

		expect(result.allowed).toBe(false);
		expect(result.violations.map((violation) => violation.code)).toContain(
			"DAILY_LOSS_LIMIT",
		);
	});

	it("blocks when weekly BTC-denominated loss exceeds the limit", () => {
		const result = validateBeforeExecution(
			baseInput({
				holdings: { USDC: 8_500 },
				weeklyBaselineBtcValue: 0.1,
			}),
		);

		expect(result.allowed).toBe(false);
		expect(result.violations.map((violation) => violation.code)).toContain(
			"WEEKLY_LOSS_LIMIT",
		);
	});

	it("allows defensive cash as recommended_asset", () => {
		const result = validateBeforeExecution(
			baseInput({
				recommendation: {
					...recommendation,
					recommended_asset: "USDC",
					reason: "Broad weakness; preserve capital in cash.",
				},
			}),
		);

		expect(result.allowed).toBe(true);
		expect(result.violations).toEqual([]);
	});

	it("skips max allocation checks for defensive cash trades", () => {
		const result = validateBeforeExecution(
			baseInput({
				proposedTrade: { symbol: "USDC", quoteValue: 5_000 },
			}),
		);

		expect(result.allowed).toBe(true);
		expect(result.violations).toEqual([]);
	});

	it("rejects assets outside the tradeable universe", () => {
		const result = validateBeforeExecution(
			baseInput({
				recommendation: {
					...recommendation,
					recommended_asset: "LINK",
				},
			}),
		);

		expect(result.allowed).toBe(false);
		expect(result.violations.map((violation) => violation.code)).toContain(
			"UNTRADEABLE_ASSET",
		);
	});

	it("blocks proposed trades that would exceed max allocation", () => {
		const result = validateBeforeExecution(
			baseInput({
				proposedTrade: { symbol: "SOL", quoteValue: 3_334 },
			}),
		);

		expect(result.allowed).toBe(false);
		expect(result.violations.map((violation) => violation.code)).toContain(
			"MAX_ALLOCATION",
		);
	});

	it("blocks proposed trades that would open a sixth position", () => {
		const result = validateBeforeExecution(
			baseInput({
				holdings: {
					USDC: 1_000,
					BTC: 0.001,
					ETH: 0.01,
					SOL: 1,
					LINK: 10,
					AVAX: 5,
				},
				prices: {
					...prices,
					LINK: 20,
					AVAX: 30,
				},
				tradeableSymbols: [
					"BTC",
					"ETH",
					"SOL",
					"USDC",
					"LINK",
					"AVAX",
					"MATIC",
				],
				proposedTrade: { symbol: "MATIC", quoteValue: 100 },
			}),
		);

		expect(result.allowed).toBe(false);
		expect(result.violations.map((violation) => violation.code)).toContain(
			"MAX_POSITIONS",
		);
	});
});
