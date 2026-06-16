import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAnalysisContext } from "@/analysis/buildAnalysisContext.js";
import { socialMediaSource } from "@/analysis/sources/socialMediaSource.js";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import { analyzeSocialMedia } from "@/llm/analyzeSocialMedia.js";
import { getAnalyzableAssets } from "@/llm/prompt.js";
import type { SocialMediaAnalysis } from "@/schemas/SocialMediaAnalysis.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { collectSocialMediaSignals } from "@/sources/social_media/collectSocialMediaSignals.js";

vi.mock("@/sources/social_media/collectSocialMediaSignals.js", () => ({
	collectSocialMediaSignals: vi.fn(),
}));

vi.mock("@/llm/analyzeSocialMedia.js", () => ({
	analyzeSocialMedia: vi.fn(),
}));

const sampleSignals: SocialMediaSignal[] = [
	{
		index: 0,
		id: "111",
		source: "twitter",
		username: "whale_alert",
		text: "Large BTC transfer detected",
		asOf: "2026-06-16T12:00:00.000Z",
		impressions: 42_000,
	},
];

const sampleAnalysis: SocialMediaAnalysis = {
	total_retrieved: 1,
	relevant_count: 1,
	summary: "One actionable whale alert.",
	themes: ["whale flow"],
	by_asset: [
		{
			asset: "BTC",
			sentiment: "bearish",
			note: "Exchange inflow increases sell-pressure risk.",
		},
	],
	top_posts: [
		{
			post_index: 0,
			id: "twitter:111",
			username: "whale_alert",
			rank: 1,
			relevance: "high",
			assets: ["BTC"],
			signal_type: "whale_alert",
			summary: "Large BTC moved to an exchange.",
			why: "Direct near-term supply signal.",
		},
	],
};

describe("socialMediaSource", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("is disabled unless SOCIAL_MEDIA_ENABLED is set", () => {
		const disabled = loadTestConfig({ SOCIAL_MEDIA_ENABLED: "false" });
		const enabled = loadTestConfig({ SOCIAL_MEDIA_ENABLED: "true" });

		expect(socialMediaSource.isEnabled(disabled)).toBe(false);
		expect(socialMediaSource.isEnabled(enabled)).toBe(true);
	});

	it("returns a digest prompt and structured payload when analysis succeeds", async () => {
		vi.mocked(collectSocialMediaSignals).mockResolvedValue(sampleSignals);
		vi.mocked(analyzeSocialMedia).mockResolvedValue({
			analysis: sampleAnalysis,
			llm: { rawResponse: "{}", attempt: "initial" },
		});

		const config = loadTestConfig({ SOCIAL_MEDIA_ENABLED: "true" });
		const assets = getAnalyzableAssets(config);
		const section = await socialMediaSource.fetch(config, assets);

		expect(section.payload).toEqual({
			signals: sampleSignals,
			analysis: sampleAnalysis,
		});
		expect(section.promptText).toContain("retrieved=1 relevant=1");
		expect(section.promptText).toContain("top_post_full_text:");
		expect(section.promptText).not.toContain(
			"Posted by @whale_alert at 2026-06-16T12:00:00.000Z: Large BTC transfer detected",
		);
	});

	it("falls back to raw posts when analysis fails", async () => {
		vi.mocked(collectSocialMediaSignals).mockResolvedValue(sampleSignals);
		vi.mocked(analyzeSocialMedia).mockRejectedValue(new Error("LLM down"));
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const config = loadTestConfig({ SOCIAL_MEDIA_ENABLED: "true" });
		const assets = getAnalyzableAssets(config);
		const section = await socialMediaSource.fetch(config, assets);

		expect(section.payload).toEqual({ signals: sampleSignals });
		expect(section.promptText).toContain("[index=0]");
		expect(warnSpy).toHaveBeenCalledWith(
			"Social media analysis failed; falling back to raw posts: LLM down",
		);

		warnSpy.mockRestore();
	});
});

describe("buildAnalysisContext with socialMediaSource", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("skips the social source when disabled", async () => {
		const config = loadTestConfig({ SOCIAL_MEDIA_ENABLED: "false" });
		const assets = getAnalyzableAssets(config);

		await expect(
			buildAnalysisContext(config, assets, {
				sources: [socialMediaSource],
			}),
		).rejects.toThrow("No analysis data sources produced sections");

		expect(collectSocialMediaSignals).not.toHaveBeenCalled();
	});
});
