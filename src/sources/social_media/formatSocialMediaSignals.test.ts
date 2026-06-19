import { describe, expect, it } from "vitest";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal";
import { formatSocialMediaSignals } from "@/sources/social_media/formatSocialMediaSignals";

const sampleSignal = (
	overrides: Partial<SocialMediaSignal> = {},
): SocialMediaSignal => ({
	index: 0,
	id: "1234567890",
	source: "twitter",
	username: "whale_alert",
	text: "Large BTC transfer detected",
	asOf: "2026-06-16T12:00:00.000Z",
	impressions: 42_000,
	...overrides,
});

describe("formatSocialMediaSignals", () => {
	it("includes stable post index in each line for Stage 1 cross-referencing", () => {
		const formatted = formatSocialMediaSignals([
			sampleSignal({
				index: 1,
				id: "9876543210",
				username: "CoinDesk",
				text: "BTC ETF inflows continue",
				asOf: "2026-06-16T13:00:00.000Z",
			}),
			sampleSignal(),
		]);

		expect(formatted).toContain("[post_id=0]");
		expect(formatted).toContain("[post_id=1]");
		expect(formatted).toContain("@CoinDesk");
		expect(formatted).toContain("@whale_alert");
		expect(formatted.indexOf("[post_id=1]")).toBeLessThan(
			formatted.indexOf("[post_id=0]"),
		);
	});

	it("keeps each post on one line when tweet text contains line breaks", () => {
		const formatted = formatSocialMediaSignals([
			sampleSignal({
				text: "Line one\nLine two\r\nLine three",
			}),
		]);

		const postLine = formatted
			.split("\n")
			.find((line) => line.includes("[post_id=0]"));

		expect(postLine).toBe(
			"[post_id=0] Posted by @whale_alert at 2026-06-16T12:00:00.000Z: line one line two line three",
		);
	});

	it("strips t.co links from tweet text in the prompt", () => {
		const formatted = formatSocialMediaSignals([
			sampleSignal({
				text: "250,000,000 #USDC minted at USDC Treasury https://t.co/ah8pjQ1Q81",
			}),
		]);

		expect(formatted).toContain(": 250,000,000 #usdc minted at usdc treasury");
		expect(formatted).not.toContain("t.co");
	});

	it("lowercases tweet text in the prompt to reduce ALL-CAPS wire bias", () => {
		const formatted = formatSocialMediaSignals([
			sampleSignal({
				text: "BREAKING: FED HOLDS RATES STEADY",
			}),
		]);

		expect(formatted).toContain(": breaking: fed holds rates steady");
		expect(formatted).not.toContain("BREAKING");
	});
});
