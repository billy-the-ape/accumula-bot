import { describe, expect, it, vi } from "vitest";
import { loadTestConfig } from "@/config/loadTestConfig";
import { collectSocialMediaSignals } from "@/sources/social_media/collectSocialMediaSignals";
import { getTwitterSearchResult } from "@/sources/social_media/twitterClient/twitterClient";

vi.mock("@/sources/social_media/twitterClient/twitterClient", () => ({
	getTwitterSearchResult: vi.fn(),
}));

describe("collectSocialMediaSignals", () => {
	it("maps tweet index and id onto SocialMediaSignal", async () => {
		vi.mocked(getTwitterSearchResult).mockResolvedValue([
			{
				index: 3,
				id: "tweet-abc",
				username: "whale_alert",
				fullText: "Large BTC transfer detected",
				tweetedDate: Date.parse("2026-06-16T12:00:00.000Z"),
				views: { count: "50000", state: "EnabledWithCount" },
			},
		]);

		const config = loadTestConfig({
			TWITTER_SEARCH_STRING: "bitcoin",
			TWITTER_SEARCH_MAX_PAGES: "1",
		});

		const signals = await collectSocialMediaSignals(config);

		expect(signals).toEqual([
			{
				index: 3,
				id: "tweet-abc",
				source: "twitter",
				username: "whale_alert",
				text: "Large BTC transfer detected",
				asOf: "2026-06-16T12:00:00.000Z",
				impressions: 50_000,
			},
		]);
	});
});
