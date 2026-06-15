import { describe, expect, it } from "vitest";
import { deriveVolumeTrend } from "@/sources/market/volumeTrend.js";

describe("deriveVolumeTrend", () => {
	it("returns rising when recent volume is materially higher", () => {
		const volumes: Array<[number, number]> = [
			[1, 100],
			[2, 110],
			[3, 105],
			[4, 150],
			[5, 160],
			[6, 170],
		];

		expect(deriveVolumeTrend(volumes)).toBe("rising");
	});

	it("returns falling when recent volume is materially lower", () => {
		const volumes: Array<[number, number]> = [
			[1, 200],
			[2, 210],
			[3, 205],
			[4, 120],
			[5, 110],
			[6, 100],
		];

		expect(deriveVolumeTrend(volumes)).toBe("falling");
	});

	it("returns flat when volume is stable", () => {
		const volumes: Array<[number, number]> = [
			[1, 100],
			[2, 101],
			[3, 99],
			[4, 100],
			[5, 102],
			[6, 98],
		];

		expect(deriveVolumeTrend(volumes)).toBe("flat");
	});
});
