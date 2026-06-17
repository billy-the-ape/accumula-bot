import { describe, expect, it } from "vitest";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { formatSocialMediaRelevancePosts } from "@/sources/social_media/formatSocialMediaRelevancePosts.js";

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

describe("formatSocialMediaRelevancePosts", () => {
	it("formats each post on one line with a post_id label", () => {
		const formatted = formatSocialMediaRelevancePosts([
			sampleSignal(),
			sampleSignal({
				index: 5,
				username: "DeItaone",
				text: "Fed speaker on rates",
			}),
		]);

		expect(formatted).toContain(
			"[post_id=0] @whale_alert (2026-06-16T12:00:00.000Z): Large BTC transfer detected",
		);
		expect(formatted).toContain(
			"[post_id=5] @DeItaone (2026-06-16T12:00:00.000Z): Fed speaker on rates",
		);
		expect(formatted).not.toContain("[users tagged=");
	});
});
