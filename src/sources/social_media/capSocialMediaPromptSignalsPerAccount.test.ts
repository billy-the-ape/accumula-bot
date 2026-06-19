import { describe, expect, it } from "vitest";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { capSocialMediaPromptSignalsPerAccount } from "@/sources/social_media/capSocialMediaPromptSignalsPerAccount.js";
import { whyReferencesPostText } from "@/sources/social_media/validateSocialMediaTopPostWhy.js";

const makeSignal = (
	index: number,
	username: string,
	asOf: string,
): SocialMediaSignal => ({
	index,
	id: String(index),
	source: "twitter",
	username,
	text: `Post ${index} from ${username}`,
	asOf,
	impressions: 100,
});

describe("capSocialMediaPromptSignalsPerAccount", () => {
	it("limits each username to the newest posts only", () => {
		const signals = [
			makeSignal(0, "DeItaone", "2026-06-17T10:00:00.000Z"),
			makeSignal(1, "DeItaone", "2026-06-17T11:00:00.000Z"),
			makeSignal(2, "DeItaone", "2026-06-17T12:00:00.000Z"),
			makeSignal(3, "whale_alert", "2026-06-17T09:00:00.000Z"),
		];

		const capped = capSocialMediaPromptSignalsPerAccount(signals, 2);

		expect(capped.map((signal) => signal.index)).toEqual([2, 1, 3]);
	});
});
describe("whyReferencesPostText", () => {
	it("accepts why text that cites the post", () => {
		expect(
			whyReferencesPostText(
				"Reports CPI came in at 3.2% vs 3.0% expected",
				"BREAKING: CPI 3.2% vs 3.0% expected",
			),
		).toBe(true);
	});

	it("rejects generic account-praise why text", () => {
		expect(
			whyReferencesPostText(
				"Trusted wire headline from a macro account",
				"BREAKING: CPI 3.2% vs 3.0% expected",
			),
		).toBe(false);
	});
});
