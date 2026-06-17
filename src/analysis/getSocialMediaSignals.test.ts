import { describe, expect, it } from "vitest";
import {
	getSocialMediaAnalysisFromContext,
	getSocialMediaSectionFromContext,
	getSocialMediaSignalsFromContext,
} from "@/analysis/getSocialMediaSignals.js";
import type { AnalysisContext } from "@/analysis/types.js";
import type { SocialMediaAnalysis } from "@/schemas/SocialMediaAnalysis.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";

const sampleSignal: SocialMediaSignal = {
	index: 0,
	id: "111",
	source: "twitter",
	username: "whale_alert",
	text: "Large BTC transfer detected",
	asOf: "2026-06-16T12:00:00.000Z",
	impressions: 42_000,
};

const sampleAnalysis: SocialMediaAnalysis = {
	total_retrieved: 1,
	relevant_count: 1,
	summary: "One actionable whale alert.",
	themes: ["whale flow"],
	by_asset: [],
	top_posts: [
		{
			post_id: 0,
			id: "twitter:111",
			username: "whale_alert",
			rank: 1,
			relevance: "high",
			assets: ["BTC"],
			signal_type: "whale_alert",
			summary: "Large BTC moved to an exchange.",
			why: "Direct near-term supply signal.",
		},
	],
};

function createContext(payload: unknown): AnalysisContext {
	return {
		fetchedAt: new Date().toISOString(),
		sections: [
			{
				sourceId: "social_media",
				label: "Social media",
				payload,
				promptText: "digest",
			},
		],
	};
}

describe("getSocialMediaSignalsFromContext", () => {
	it("returns signals from the structured section payload", () => {
		const context = createContext({
			signals: [sampleSignal],
			analysis: sampleAnalysis,
		});

		expect(getSocialMediaSignalsFromContext(context)).toEqual([sampleSignal]);
	});

	it("supports legacy array payloads", () => {
		const context = createContext([sampleSignal]);

		expect(getSocialMediaSignalsFromContext(context)).toEqual([sampleSignal]);
	});

	it("returns an empty array when the section is missing or invalid", () => {
		expect(
			getSocialMediaSignalsFromContext({
				fetchedAt: new Date().toISOString(),
				sections: [],
			}),
		).toEqual([]);
		expect(
			getSocialMediaSignalsFromContext(createContext({ bad: true })),
		).toEqual([]);
	});
});

describe("getSocialMediaAnalysisFromContext", () => {
	it("returns analysis when Stage 1 succeeded", () => {
		const context = createContext({
			signals: [sampleSignal],
			analysis: sampleAnalysis,
		});

		expect(getSocialMediaAnalysisFromContext(context)).toEqual(sampleAnalysis);
	});

	it("returns undefined for fallback payloads without analysis", () => {
		const context = createContext({ signals: [sampleSignal] });

		expect(getSocialMediaAnalysisFromContext(context)).toBeUndefined();
	});

	it("returns undefined when the section is missing", () => {
		expect(
			getSocialMediaAnalysisFromContext({
				fetchedAt: new Date().toISOString(),
				sections: [],
			}),
		).toBeUndefined();
	});
});

describe("getSocialMediaSectionFromContext", () => {
	it("returns both signals and analysis when available", () => {
		const context = createContext({
			signals: [sampleSignal],
			analysis: sampleAnalysis,
		});

		expect(getSocialMediaSectionFromContext(context)).toEqual({
			signals: [sampleSignal],
			analysis: sampleAnalysis,
		});
	});
});
