import { describe, expect, it } from "vitest";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { prefilterSocialMediaSignalsForRelevance } from "@/sources/social_media/prefilterSocialMediaSignalsForRelevance.js";

function makeSignal(
	overrides: Partial<SocialMediaSignal> = {},
): SocialMediaSignal {
	return {
		index: 0,
		id: "100",
		source: "twitter",
		username: "randomtrader",
		text: "Good morning everyone",
		asOf: "2026-06-16T12:00:00.000Z",
		impressions: 100,
		...overrides,
	};
}

describe("prefilterSocialMediaSignalsForRelevance", () => {
	it("always includes priority government, macro, and business accounts", () => {
		const signals = [
			makeSignal({ index: 0, username: "SECGov", text: "Weekly update" }),
			makeSignal({ index: 1, username: "federalreserve", text: "Statement" }),
			makeSignal({ index: 2, username: "DeItaone", text: "Morning headlines" }),
		];

		const { candidates, excludedCount } =
			prefilterSocialMediaSignalsForRelevance(signals, ["BTC"]);

		expect(candidates).toEqual(signals);
		expect(excludedCount).toBe(0);
	});

	it("includes posts that mention outlook asset symbols or names", () => {
		const signals = [
			makeSignal({ index: 0, text: "Large SOL transfer to exchange" }),
			makeSignal({ index: 1, text: "Ethereum upgrade timeline unchanged" }),
			makeSignal({ index: 2, text: "Unrelated sports score" }),
		];

		const { candidates, excludedCount } =
			prefilterSocialMediaSignalsForRelevance(signals, ["SOL", "ETH"]);

		expect(candidates.map((signal) => signal.index)).toEqual([0, 1]);
		expect(excludedCount).toBe(1);
	});

	it("includes posts with catalyst keywords even without asset mentions", () => {
		const { candidates, excludedCount } =
			prefilterSocialMediaSignalsForRelevance(
				[makeSignal({ text: "BREAKING: major exchange outage reported" })],
				["BTC"],
			);

		expect(candidates).toHaveLength(1);
		expect(excludedCount).toBe(0);
	});

	it("excludes generic posts with no asset, catalyst, or priority account", () => {
		const signals = [
			makeSignal({ index: 0, text: "Have a great weekend!" }),
			makeSignal({ index: 1, text: "New podcast episode out now" }),
		];

		const { candidates, excludedCount } =
			prefilterSocialMediaSignalsForRelevance(signals, ["BTC", "ETH"]);

		expect(candidates).toEqual([]);
		expect(excludedCount).toBe(2);
	});
});
