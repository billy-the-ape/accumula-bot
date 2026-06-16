import { describe, expect, it } from "vitest";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import {
	resolveSocialMediaSignalForTopPost,
	summarizeSocialMediaSignal,
	truncateSocialMediaPostText,
} from "@/sources/social_media/resolveSocialMediaSignal.js";

const sampleSignal: SocialMediaSignal = {
	index: 42,
	id: "999",
	source: "twitter",
	username: "whale_alert",
	text: "Large BTC transfer detected on-chain",
	asOf: "2026-06-16T12:00:00.000Z",
	impressions: 1000,
};

describe("resolveSocialMediaSignalForTopPost", () => {
	it("resolves by post_index first", () => {
		expect(
			resolveSocialMediaSignalForTopPost(
				{ post_index: 42, id: "twitter:wrong" },
				[sampleSignal],
			),
		).toEqual(sampleSignal);
	});

	it("falls back to tweet id when index lookup misses", () => {
		expect(
			resolveSocialMediaSignalForTopPost(
				{ post_index: 99, id: "twitter:999" },
				[sampleSignal],
			),
		).toEqual(sampleSignal);
	});
});

describe("summarizeSocialMediaSignal", () => {
	it("returns normalized post text", () => {
		expect(
			summarizeSocialMediaSignal({
				text: "  Line one.\n\nLine two. ",
			}),
		).toBe("Line one. Line two.");
	});

	it("truncates long post text", () => {
		const longText = "x".repeat(250);
		expect(truncateSocialMediaPostText(longText).endsWith("…")).toBe(true);
	});
});
