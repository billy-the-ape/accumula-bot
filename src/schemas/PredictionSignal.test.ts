import { describe, expect, it } from "vitest";
import {
	PredictionSignalListSchema,
	PredictionSignalSchema,
} from "@/schemas/PredictionSignal.js";

const validSignal = {
	asset: "BTC",
	source: "kalshi",
	impliedUpProbability: 0.58,
	horizonHours: 24,
	liquidityUsd: 42_000,
	asOf: "2026-06-15T15:30:00.000Z",
	marketRef: "KXBTCD-26JUN15",
};

describe("PredictionSignalSchema", () => {
	it("parses a valid signal", () => {
		const result = PredictionSignalSchema.parse(validSignal);
		expect(result).toEqual(validSignal);
	});

	it("accepts probability bounds 0 and 1", () => {
		expect(
			PredictionSignalSchema.parse({ ...validSignal, impliedUpProbability: 0 })
				.impliedUpProbability,
		).toBe(0);
		expect(
			PredictionSignalSchema.parse({ ...validSignal, impliedUpProbability: 1 })
				.impliedUpProbability,
		).toBe(1);
	});

	it("rejects probability outside 0..1", () => {
		expect(() =>
			PredictionSignalSchema.parse({
				...validSignal,
				impliedUpProbability: 1.2,
			}),
		).toThrow();
		expect(() =>
			PredictionSignalSchema.parse({
				...validSignal,
				impliedUpProbability: -0.1,
			}),
		).toThrow();
	});

	it("rejects an unknown source", () => {
		expect(() =>
			PredictionSignalSchema.parse({ ...validSignal, source: "betfair" }),
		).toThrow();
	});

	it("rejects a non-positive horizon", () => {
		expect(() =>
			PredictionSignalSchema.parse({ ...validSignal, horizonHours: 0 }),
		).toThrow();
	});

	it("rejects negative liquidity", () => {
		expect(() =>
			PredictionSignalSchema.parse({ ...validSignal, liquidityUsd: -1 }),
		).toThrow();
	});

	it("rejects an empty asset or marketRef", () => {
		expect(() =>
			PredictionSignalSchema.parse({ ...validSignal, asset: "" }),
		).toThrow();
		expect(() =>
			PredictionSignalSchema.parse({ ...validSignal, marketRef: "" }),
		).toThrow();
	});

	it("rejects an unparseable asOf timestamp", () => {
		expect(() =>
			PredictionSignalSchema.parse({ ...validSignal, asOf: "not-a-date" }),
		).toThrow();
	});
});

describe("PredictionSignalListSchema", () => {
	it("parses an array of signals", () => {
		const result = PredictionSignalListSchema.parse([
			validSignal,
			{ ...validSignal, source: "polymarket", marketRef: "btc-up-or-down" },
		]);
		expect(result).toHaveLength(2);
	});
});
