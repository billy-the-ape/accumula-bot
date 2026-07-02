import { describe, expect, it } from "vitest";
import {
	computePositionCostBasisUsd,
	computePositionReturnPct,
} from "@/domain/positionCostBasis.js";
import type { StoredTrade } from "@/schemas/Trade.js";

function trade(
	overrides: Partial<StoredTrade> & Pick<StoredTrade, "side" | "symbol">,
): StoredTrade {
	return {
		id: overrides.id ?? 1,
		portfolioId: overrides.portfolioId ?? 1,
		createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00Z"),
		quantity: overrides.quantity ?? 1,
		priceUsd: overrides.priceUsd ?? 100,
		quoteValueUsd: overrides.quoteValueUsd ?? 100,
		...overrides,
	};
}

describe("computePositionCostBasisUsd", () => {
	it("sums buy quote values for a single open position", () => {
		const trades = [
			trade({
				id: 1,
				side: "buy",
				symbol: "LINK",
				quantity: 2,
				quoteValueUsd: 40,
			}),
			trade({
				id: 2,
				side: "buy",
				symbol: "LINK",
				quantity: 1,
				quoteValueUsd: 21,
				createdAt: new Date("2026-01-02T00:00:00Z"),
			}),
		];

		expect(computePositionCostBasisUsd(trades, "LINK")).toBe(61);
	});

	it("reduces basis proportionally on partial sells", () => {
		const trades = [
			trade({
				id: 1,
				side: "buy",
				symbol: "SOL",
				quantity: 10,
				quoteValueUsd: 1_500,
			}),
			trade({
				id: 2,
				side: "sell",
				symbol: "SOL",
				quantity: 4,
				quoteValueUsd: 720,
				createdAt: new Date("2026-01-02T00:00:00Z"),
			}),
		];

		expect(computePositionCostBasisUsd(trades, "SOL")).toBe(900);
	});

	it("ignores trades for other symbols", () => {
		const trades = [
			trade({
				id: 1,
				side: "buy",
				symbol: "ETH",
				quoteValueUsd: 3_000,
			}),
		];

		expect(computePositionCostBasisUsd(trades, "LINK")).toBe(0);
	});
});

describe("computePositionReturnPct", () => {
	it("returns unrealized gain percent from cost basis", () => {
		expect(computePositionReturnPct(21, 20)).toBe(5);
	});

	it("returns zero when cost basis is unknown", () => {
		expect(computePositionReturnPct(21, 0)).toBe(0);
	});
});
