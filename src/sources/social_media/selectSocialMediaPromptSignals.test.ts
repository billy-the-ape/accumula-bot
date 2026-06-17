import { describe, expect, it } from "vitest";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { selectSocialMediaPromptSignals } from "@/sources/social_media/selectSocialMediaPromptSignals.js";

const signal = (
	id: string,
	impressions: number,
	index: number,
	asOf: string,
): SocialMediaSignal => ({
	id,
	source: "twitter",
	index,
	username: `user_${id}`,
	text: `post ${id}`,
	asOf,
	impressions,
});

describe("selectSocialMediaPromptSignals", () => {
	it("returns all signals when under the cap", () => {
		const signals = [
			signal("1", 100, 0, "2026-06-16T12:00:00.000Z"),
			signal("2", 200, 1, "2026-06-16T12:00:00.000Z"),
		];

		expect(selectSocialMediaPromptSignals(signals, 25)).toEqual(signals);
	});

	it("keeps the highest-impression posts when over the cap", () => {
		const signals = [
			signal("low", 10, 0, "2026-06-16T11:00:00.000Z"),
			signal("mid", 500, 1, "2026-06-16T12:00:00.000Z"),
			signal("high", 5000, 2, "2026-06-16T13:00:00.000Z"),
		];

		expect(
			selectSocialMediaPromptSignals(signals, 2).map((entry) => entry.id),
		).toEqual(["high", "mid"]);
	});
});
