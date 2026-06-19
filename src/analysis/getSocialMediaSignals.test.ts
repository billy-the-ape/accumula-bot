import { describe, expect, it } from "vitest";
import {
	getSocialMediaSectionFromContext,
	getSocialMediaSignalsFromContext,
	getSocialMediaTopPostsForPromptFromContext,
	getSocialMediaTopPostsForReportFromContext,
} from "@/analysis/getSocialMediaSignals.js";
import type { AnalysisContext } from "@/analysis/types.js";
import type { ScoredSocialMediaPost } from "@/schemas/ScoredSocialMediaPost.js";
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

const sampleScoredPost: ScoredSocialMediaPost = {
	externalId: "111",
	source: "twitter",
	username: "whale_alert",
	text: "Large BTC transfer detected",
	postedAt: "2026-06-16T12:00:00.000Z",
	impressions: 42_000,
	relevanceScore: 9,
	scoredAt: "2026-06-16T12:05:00.000Z",
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
			topPostsForPrompt: [sampleScoredPost],
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

describe("getSocialMediaTopPostsForPromptFromContext", () => {
	it("returns top prompt posts when scoring succeeded", () => {
		const context = createContext({
			signals: [sampleSignal],
			topPostsForPrompt: [sampleScoredPost],
		});

		expect(getSocialMediaTopPostsForPromptFromContext(context)).toEqual([
			sampleScoredPost,
		]);
	});
});

describe("getSocialMediaTopPostsForReportFromContext", () => {
	it("returns top report posts when scoring succeeded", () => {
		const context = createContext({
			signals: [sampleSignal],
			topPostsForReport: [sampleScoredPost],
		});

		expect(getSocialMediaTopPostsForReportFromContext(context)).toEqual([
			sampleScoredPost,
		]);
	});
});

describe("getSocialMediaSectionFromContext", () => {
	it("returns signals and scored posts when available", () => {
		const context = createContext({
			signals: [sampleSignal],
			topPostsForPrompt: [sampleScoredPost],
			topPostsForReport: [sampleScoredPost],
			scoringStats: {
				fetched: 1,
				newlyScored: 1,
				skippedAlreadyScored: 0,
			},
		});

		expect(getSocialMediaSectionFromContext(context)).toEqual({
			signals: [sampleSignal],
			topPostsForPrompt: [sampleScoredPost],
			topPostsForReport: [sampleScoredPost],
			scoringStats: {
				fetched: 1,
				newlyScored: 1,
				skippedAlreadyScored: 0,
			},
		});
	});
});
