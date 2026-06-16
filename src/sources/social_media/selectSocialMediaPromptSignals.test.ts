import { describe, expect, it } from "vitest";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { selectSocialMediaPromptSignals } from "@/sources/social_media/selectSocialMediaPromptSignals.js";

const signal = (
	id: string,
	impressions: number,
	index: number,
): SocialMediaSignal => ({
	id,
	source: "twitter",
	index,
	username: `user_${id}`,
	text: `post ${id}`,
	asOf: "2026-06-16T12:00:00.000Z",
	impressions,
});

describe("selectSocialMediaPromptSignals", () => {
	it("returns all signals when under the cap", () => {
		const signals = [signal("1", 100, 0), signal("2", 200, 1)];

		expect(selectSocialMediaPromptSignals(signals, 25)).toEqual(signals);
	});

	it("keeps the highest-impression posts when over the cap", () => {
		const signals = [
			signal("low", 10, 0),
			signal("mid", 500, 1),
			signal("high", 5000, 2),
		];

		expect(
			selectSocialMediaPromptSignals(signals, 2).map((entry) => entry.id),
		).toEqual(["high", "mid"]);
	});
});
