import { describe, expect, it } from "vitest";
import { parseSocialMediaRelevanceScoreJson } from "@/llm/parseSocialMediaRelevanceScore.js";
import { createSocialMediaRelevanceScoreValidation } from "@/schemas/SocialMediaRelevanceScore.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { formatScoredSocialMediaPosts } from "@/sources/social_media/formatScoredSocialMediaPosts.js";

const batchSignals: SocialMediaSignal[] = [
	{
		index: 42,
		id: "111",
		source: "twitter",
		username: "whale_alert",
		text: "Large BTC transfer detected",
		asOf: "2026-06-16T12:00:00.000Z",
		impressions: 42_000,
	},
	{
		index: 87,
		id: "222",
		source: "twitter",
		username: "CoinDesk",
		text: "Low impact headline",
		asOf: "2026-06-16T11:00:00.000Z",
		impressions: 1_000,
	},
];

const validation = createSocialMediaRelevanceScoreValidation(batchSignals);

describe("parseSocialMediaRelevanceScoreJson", () => {
	it("parses valid score payloads", () => {
		const result = parseSocialMediaRelevanceScoreJson(
			JSON.stringify({
				scores: [
					{ post_index: 42, relevance_score: 9 },
					{ post_index: 87, relevance_score: 3 },
				],
			}),
			validation,
		);

		expect(result).toEqual([
			{ post_index: 42, relevance_score: 9 },
			{ post_index: 87, relevance_score: 3 },
		]);
	});

	it("rejects missing scores", () => {
		expect(() =>
			parseSocialMediaRelevanceScoreJson(
				JSON.stringify({
					scores: [{ post_index: 42, relevance_score: 9 }],
				}),
				validation,
			),
		).toThrow(/Expected 2 scores/);
	});
});

describe("formatScoredSocialMediaPosts", () => {
	it("formats ranked posts for the trade prompt", () => {
		const formatted = formatScoredSocialMediaPosts([
			{
				externalId: "111",
				source: "twitter",
				username: "whale_alert",
				text: "Large BTC transfer detected",
				postedAt: "2026-06-16T12:00:00.000Z",
				impressions: 42_000,
				relevanceScore: 9,
			},
		]);

		expect(formatted).toContain(
			"Top social media signals (last 24h, relevance >= 4):",
		);
		expect(formatted).toContain("[score=9] @whale_alert");
		expect(formatted).toContain("large btc transfer detected");
	});

	it("returns an empty-state message when no posts qualify", () => {
		expect(formatScoredSocialMediaPosts([])).toContain(
			"No scored social media posts met the relevance threshold",
		);
	});
});
