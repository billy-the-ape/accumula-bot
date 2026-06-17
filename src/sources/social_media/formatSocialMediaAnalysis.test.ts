import { describe, expect, it } from "vitest";
import type { SocialMediaAnalysis } from "@/schemas/SocialMediaAnalysis.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import {
	formatSocialMediaAnalysis,
	SOCIAL_MEDIA_TOP_POST_FULL_TEXT_COUNT,
} from "@/sources/social_media/formatSocialMediaAnalysis.js";
import { formatSocialMediaSignals } from "@/sources/social_media/formatSocialMediaSignals.js";

const sampleSignal = (
	overrides: Partial<SocialMediaSignal> = {},
): SocialMediaSignal => ({
	index: 0,
	id: "111",
	source: "twitter",
	username: "whale_alert",
	text: "Large BTC transfer detected",
	asOf: "2026-06-16T12:00:00.000Z",
	impressions: 42_000,
	...overrides,
});

const sampleTopPost = (
	overrides: Partial<SocialMediaAnalysis["top_posts"][number]> = {},
): SocialMediaAnalysis["top_posts"][number] => ({
	post_id: 0,
	id: "twitter:111",
	username: "whale_alert",
	rank: 1,
	relevance: "high",
	assets: ["BTC"],
	signal_type: "whale_alert",
	summary: "Large BTC moved to an exchange.",
	why: "Exchange inflow is the clearest near-term sell-pressure signal.",
	...overrides,
});

const sampleAnalysis: SocialMediaAnalysis = {
	total_retrieved: 2,
	relevant_count: 1,
	summary: "One actionable whale alert amid macro noise.",
	themes: ["whale flow", "macro"],
	by_asset: [
		{
			asset: "BTC",
			sentiment: "mixed",
			note: "Whale deposit offset by steady ETF inflows.",
		},
	],
	top_posts: [sampleTopPost()],
};

describe("formatSocialMediaAnalysis", () => {
	it("formats counts, summary, themes, and per-asset notes", () => {
		const formatted = formatSocialMediaAnalysis(sampleAnalysis, [
			sampleSignal(),
			sampleSignal({ id: "222", username: "macro_news", text: "Fed speaker" }),
		]);

		expect(formatted).toContain("retrieved=2 relevant=1");
		expect(formatted).toContain(
			"summary: One actionable whale alert amid macro noise.",
		);
		expect(formatted).toContain("themes: whale flow, macro");
		expect(formatted).toContain(
			"BTC: sentiment=mixed — Whale deposit offset by steady ETF inflows.",
		);
	});

	it("includes ranked top signals with why", () => {
		const formatted = formatSocialMediaAnalysis(sampleAnalysis, [
			sampleSignal(),
		]);

		expect(formatted).toContain("top_signals:");
		expect(formatted).toContain(
			"1. [id=twitter:111] @whale_alert (high) — Large BTC moved to an exchange.",
		);
		expect(formatted).toContain(
			"why: Exchange inflow is the clearest near-term sell-pressure signal.",
		);
	});

	it("includes full text for up to the top 3 ranked posts", () => {
		const analysis: SocialMediaAnalysis = {
			...sampleAnalysis,
			total_retrieved: 4,
			relevant_count: 4,
			top_posts: [
				sampleTopPost({
					post_id: 3,
					id: "twitter:444",
					username: "d",
					rank: 4,
					summary: "fourth",
					why: "fourth why",
				}),
				sampleTopPost({
					post_id: 1,
					id: "twitter:222",
					username: "b",
					rank: 2,
					summary: "second",
					why: "second why",
				}),
				sampleTopPost({
					post_id: 0,
					id: "twitter:111",
					username: "a",
					rank: 1,
					summary: "first",
					why: "first why",
				}),
				sampleTopPost({
					post_id: 2,
					id: "twitter:333",
					username: "c",
					rank: 3,
					summary: "third",
					why: "third why",
				}),
			],
		};

		const signals = [
			sampleSignal({ index: 0, id: "111", text: "full text one" }),
			sampleSignal({ index: 1, id: "222", text: "full text two" }),
			sampleSignal({ index: 2, id: "333", text: "full text three" }),
			sampleSignal({ index: 3, id: "444", text: "full text four" }),
		];

		const formatted = formatSocialMediaAnalysis(analysis, signals);

		expect(formatted).toContain("[id=twitter:111] @whale_alert: full text one");
		expect(formatted).toContain("[id=twitter:222] @whale_alert: full text two");
		expect(formatted).toContain(
			"[id=twitter:333] @whale_alert: full text three",
		);
		expect(formatted).not.toContain("full text four");
		expect(SOCIAL_MEDIA_TOP_POST_FULL_TEXT_COUNT).toBe(3);
	});

	it("is more compact than dumping all raw posts", () => {
		const signals = Array.from({ length: 20 }, (_, index) =>
			sampleSignal({
				id: String(index),
				text: `Repeated market commentary paragraph ${index} `.repeat(8),
			}),
		);
		const analysis: SocialMediaAnalysis = {
			total_retrieved: 20,
			relevant_count: 2,
			summary: "Two posts mattered.",
			themes: ["macro"],
			by_asset: [],
			top_posts: [
				sampleTopPost({
					post_id: 0,
					id: "twitter:0",
					rank: 1,
					summary: "Whale move",
					why: "Whale signal",
				}),
				sampleTopPost({
					post_id: 1,
					id: "twitter:1",
					username: "macro_news",
					rank: 2,
					relevance: "medium",
					assets: ["MARKET"],
					signal_type: "macro",
					summary: "Fed tone",
					why: "Macro tone",
				}),
			],
		};

		const digest = formatSocialMediaAnalysis(analysis, signals);
		const raw = formatSocialMediaSignals(signals);

		expect(digest.length).toBeLessThan(raw.length / 2);
	});

	it("formats an empty analysis without top sections", () => {
		const formatted = formatSocialMediaAnalysis(
			{
				total_retrieved: 0,
				relevant_count: 0,
				summary: "No social media posts retrieved.",
				themes: [],
				by_asset: [],
				top_posts: [],
			},
			[],
		);

		expect(formatted).toBe(
			"retrieved=0 relevant=0\nsummary: No social media posts retrieved.",
		);
	});
});
