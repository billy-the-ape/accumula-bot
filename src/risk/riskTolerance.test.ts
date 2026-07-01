import { describe, expect, it } from "vitest";
import type { OutlookThresholds } from "@/execution/outlookActions.js";
import {
	MIN_CONFIDENCE_BY_RISK_TOLERANCE,
	resolveOutlookThresholds,
} from "@/risk/riskTolerance.js";

const BASE_THRESHOLDS: OutlookThresholds = {
	buyMinDirectionScore: 6.9,
	sellMaxDirectionScore: 3.9,
	minConfidence: 0.67,
};

describe("MIN_CONFIDENCE_BY_RISK_TOLERANCE", () => {
	it("maps low to the highest bar", () => {
		expect(MIN_CONFIDENCE_BY_RISK_TOLERANCE.low).toBe(0.74);
	});

	it("maps medium to the global default", () => {
		expect(MIN_CONFIDENCE_BY_RISK_TOLERANCE.medium).toBe(0.67);
	});

	it("maps high to the lowest bar", () => {
		expect(MIN_CONFIDENCE_BY_RISK_TOLERANCE.high).toBe(0.6);
	});
});

describe("resolveOutlookThresholds", () => {
	it("overrides minConfidence for low risk tolerance", () => {
		expect(resolveOutlookThresholds(BASE_THRESHOLDS, "low")).toEqual({
			buyMinDirectionScore: 6.9,
			sellMaxDirectionScore: 3.9,
			minConfidence: 0.74,
		});
	});

	it("overrides minConfidence for medium risk tolerance", () => {
		expect(resolveOutlookThresholds(BASE_THRESHOLDS, "medium")).toEqual({
			buyMinDirectionScore: 6.9,
			sellMaxDirectionScore: 3.9,
			minConfidence: 0.67,
		});
	});

	it("overrides minConfidence for high risk tolerance", () => {
		expect(resolveOutlookThresholds(BASE_THRESHOLDS, "high")).toEqual({
			buyMinDirectionScore: 6.9,
			sellMaxDirectionScore: 3.9,
			minConfidence: 0.6,
		});
	});

	it("overrides minConfidence for custom portfolio risk", () => {
		expect(resolveOutlookThresholds(BASE_THRESHOLDS, "0.5")).toEqual({
			buyMinDirectionScore: 6.9,
			sellMaxDirectionScore: 3.9,
			minConfidence: 0.5,
		});
	});

	it("does not mutate the base thresholds object", () => {
		const base = { ...BASE_THRESHOLDS };
		resolveOutlookThresholds(base, "low");
		expect(base).toEqual(BASE_THRESHOLDS);
	});
});
