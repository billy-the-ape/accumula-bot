import { describe, expect, it } from "vitest";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { orderSocialMediaPromptSignals } from "@/sources/social_media/orderSocialMediaPromptSignals.js";

const makeSignal = (index: number, asOf: string): SocialMediaSignal => ({
	index,
	id: String(index),
	source: "twitter",
	username: "user",
	text: `Post ${index}`,
	asOf,
	impressions: 100,
});

describe("orderSocialMediaPromptSignals", () => {
	it("returns newest posts first", () => {
		const ordered = orderSocialMediaPromptSignals([
			makeSignal(5, "2026-06-17T10:00:00.000Z"),
			makeSignal(2, "2026-06-17T12:00:00.000Z"),
			makeSignal(9, "2026-06-17T11:00:00.000Z"),
		]);

		expect(ordered.map((signal) => signal.index)).toEqual([2, 9, 5]);
	});
});
