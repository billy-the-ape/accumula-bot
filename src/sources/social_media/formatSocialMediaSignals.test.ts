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
			sampleSignal(),
			sampleSignal({
				index: 1,
				id: "9876543210",
				username: "WatcherGuru",
				text: "BTC ETF inflows continue",
			}),
		]);

		expect(formatted).toContain("[users tagged=crypto]");
		expect(formatted).toContain("[post_id=0]");
		expect(formatted).toContain("[post_id=1]");
		expect(formatted).toContain("@whale_alert");
		expect(formatted).toContain("@WatcherGuru");
	});
});
