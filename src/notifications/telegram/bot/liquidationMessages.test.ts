import { describe, expect, it } from "vitest";
import { computeLiquidationBreakdown } from "@/live/computeLiquidationBreakdown.js";
import {
	formatLiquidationFailedMessage,
	formatLiquidationSummaryMessage,
} from "@/notifications/telegram/bot/liquidationMessages.js";

describe("formatLiquidationSummaryMessage", () => {
	it("escapes parentheses in the profit fee line for MarkdownV2", () => {
		const breakdown = computeLiquidationBreakdown({
			totalDepositedUsd: 1000,
			totalWithdrawnUsd: 0,
			grossUsdc: 1200,
			profitFeeBps: 500,
		});

		const message = formatLiquidationSummaryMessage({
			destinationAddress: "0x1111111111111111111111111111111111111111",
			estimatedGrossUsdc: 1200,
			breakdown,
			profitFeeBps: 500,
		});

		expect(message).toContain("Fee \\(5\\.0% of profit\\):");
		expect(message).toContain("*1,200\\.00*");
		expect(message).not.toMatch(/Fee \(5\.0% of profit\):/);
	});
});

describe("formatLiquidationFailedMessage", () => {
	it("escapes reserved characters in error text", () => {
		const message = formatLiquidationFailedMessage(
			"Paymaster rejected (insufficient allowance)",
		);

		expect(message).toContain("\\(insufficient allowance\\)");
	});
});
