import { describe, expect, it } from "vitest";
import {
	fromTokenUnits,
	toTokenUnits,
	truncateToTokenDecimals,
} from "@/live/dex/tokenAmounts.js";

describe("tokenAmounts", () => {
	it("converts human USDC amounts to base units", () => {
		expect(toTokenUnits(100, 6)).toBe(100_000_000n);
		expect(fromTokenUnits(100_000_000n, 6)).toBe(100);
	});

	it("truncates float dust to token decimals", () => {
		expect(truncateToTokenDecimals(1.23456789, 6)).toBe(1.234567);
	});
});
