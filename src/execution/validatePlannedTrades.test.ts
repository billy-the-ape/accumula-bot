import { describe, expect, it } from "vitest";
import type { PlannedFill } from "@/execution/planTrades.js";
import { validatePlannedPaperTrades } from "@/execution/validatePlannedTrades.js";
import type { TradeRecommendation } from "@/schemas/TradeRecommendation.js";

const baseRecommendation: TradeRecommendation = {
	outlooks: [{ asset: "SOL", direction_score: 9, confidence: 0.8 }],
	summary: "test",
};

function buyFill(
	symbol: string,
	quantity: number,
	priceUsd: number,
): PlannedFill {
	return { side: "buy", symbol, quantity, priceUsd };
}

const prices = {
	USDC: 1,
	ETH: 1,
	SOL: 1,
	BTC: 1,
} as const;

describe("validatePlannedPaperTrades category guardrails", () => {
	it("allows trades when risk_on stays within limit", () => {
		const result = validatePlannedPaperTrades({
			recommendation: baseRecommendation,
			holdings: { USDC: 2000, ETH: 8000 },
			prices,
			tradingEnabled: true,
			accumulateSymbol: "BTC",
			dailyBaselineBtcValue: 0,
			weeklyBaselineBtcValue: 0,
			cashSymbol: "USDC",
			tradeableSymbols: ["ETH", "SOL", "BTC", "USDC"],
			fills: [buyFill("SOL", 400, 1)],
			maxRiskOnFraction: 0.85,
		});

		expect(result.allowed).toBe(true);
	});

	it("blocks trades that would exceed risk_on limit", () => {
		const result = validatePlannedPaperTrades({
			recommendation: baseRecommendation,
			holdings: { USDC: 2000, ETH: 8000 },
			prices,
			tradingEnabled: true,
			accumulateSymbol: "BTC",
			dailyBaselineBtcValue: 0,
			weeklyBaselineBtcValue: 0,
			cashSymbol: "USDC",
			tradeableSymbols: ["ETH", "SOL", "BTC", "USDC"],
			fills: [buyFill("SOL", 600, 1)],
			maxRiskOnFraction: 0.85,
		});

		expect(result.allowed).toBe(false);
		expect(result.violations[0]?.code).toBe("CATEGORY_RISK_ON_LIMIT");
	});
});
