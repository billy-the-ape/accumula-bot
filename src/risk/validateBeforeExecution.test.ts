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
	outlooks: [
		{
			asset: "SOL",
			direction_score: 8,
			confidence: 0.75,
			reason: "SOL momentum",
		},
		{
			asset: "BTC",
			direction_score: 5,
			confidence: 0.6,
			reason: "BTC stable",
		},
		{
			asset: "ETH",
			direction_score: 4,
			confidence: 0.6,
			reason: "ETH flat",
		},
	],
	summary: "Buy SOL",
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

	it("skips max allocation checks for cash trades", () => {
		const result = validateBeforeExecution(
			baseInput({
				proposedTrades: [{ symbol: "USDC", quoteValue: 5_000 }],
			}),
		);

		expect(result.allowed).toBe(true);
		expect(result.violations).toEqual([]);
	});

	it("rejects outlook assets outside the tradeable universe", () => {
		const result = validateBeforeExecution(
			baseInput({
				recommendation: {
					...recommendation,
					outlooks: [
						{
							asset: "LINK",
							direction_score: 8,
							confidence: 0.7,
							reason: "Invalid asset",
						},
					],
				},
			}),
		);

		expect(result.allowed).toBe(false);
		expect(result.violations.map((violation) => violation.code)).toContain(
			"UNTRADEABLE_ASSET",
		);
	});

	it("blocks proposed trades that exceed the per-purchase limit", () => {
		const result = validateBeforeExecution(
			baseInput({
				proposedTrades: [{ symbol: "SOL", quoteValue: 2_501 }],
			}),
		);

		expect(result.allowed).toBe(false);
		expect(result.violations.map((violation) => violation.code)).toContain(
			"MAX_ALLOCATION",
		);
	});

	it("blocks proposed trades that would exceed the 50% position cap", () => {
		const result = validateBeforeExecution(
			baseInput({
				holdings: { USDC: 5_000, SOL: 33.34 },
				proposedTrades: [{ symbol: "SOL", quoteValue: 2_500 }],
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
				proposedTrades: [{ symbol: "MATIC", quoteValue: 100 }],
			}),
		);

		expect(result.allowed).toBe(false);
		expect(result.violations.map((violation) => violation.code)).toContain(
			"MAX_POSITIONS",
		);
	});
});
