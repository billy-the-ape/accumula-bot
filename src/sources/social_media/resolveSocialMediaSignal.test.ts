import { describe, expect, it } from "vitest";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import {
	normalizeSocialMediaPostText,
	normalizeSocialMediaPostTextForPrompt,
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
	it("resolves by post_id first", () => {
		expect(
			resolveSocialMediaSignalForTopPost({ post_id: 42, id: "twitter:wrong" }, [
				sampleSignal,
			]),
		).toEqual(sampleSignal);
	});

	it("falls back to tweet id when index lookup misses", () => {
		expect(
			resolveSocialMediaSignalForTopPost({ post_id: 99, id: "twitter:999" }, [
				sampleSignal,
			]),
		).toEqual(sampleSignal);
	});
});

describe("normalizeSocialMediaPostText", () => {
	it("replaces line breaks with spaces", () => {
		expect(
			normalizeSocialMediaPostText("Line one\nLine two\r\nLine three"),
		).toBe("Line one Line two Line three");
	});

	it("removes trailing t.co links", () => {
		expect(
			normalizeSocialMediaPostText(
				"250,000,000 #USDC minted at USDC Treasury https://t.co/ah8pjQ1Q81",
			),
		).toBe("250,000,000 #USDC minted at USDC Treasury");
	});
});

describe("normalizeSocialMediaPostTextForPrompt", () => {
	it("lowercases text for LLM prompts to reduce ALL-CAPS emphasis bias", () => {
		expect(
			normalizeSocialMediaPostTextForPrompt(
				"BREAKING: CPI 3.2% VS 3.0% EXPECTED",
			),
		).toBe("breaking: cpi 3.2% vs 3.0% expected");
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
