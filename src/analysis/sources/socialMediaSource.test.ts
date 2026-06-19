import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAnalysisContext } from "@/analysis/buildAnalysisContext.js";
import { socialMediaSource } from "@/analysis/sources/socialMediaSource.js";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import { getAnalyzableAssets } from "@/llm/prompt.js";
import type { ScoredSocialMediaPost } from "@/schemas/ScoredSocialMediaPost.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { processSocialMediaSignals } from "@/sources/social_media/processSocialMediaSignals.js";

vi.mock("@/sources/social_media/processSocialMediaSignals.js", () => ({
	processSocialMediaSignals: vi.fn(),
}));

vi.mock("@/storage/db.js", () => ({
	createDatabase: vi.fn(async () => ({
		db: {},
		client: { close: vi.fn() },
	})),
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

const sampleScoredPost: ScoredSocialMediaPost = {
	externalId: "111",
	source: "twitter",
	username: "whale_alert",
	text: "Large BTC transfer detected",
	postedAt: "2026-06-16T12:00:00.000Z",
	impressions: 42_000,
	relevanceScore: 9,
	scoredAt: "2026-06-16T12:05:00.000Z",
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

	it("returns scored posts for the prompt and report when scoring succeeds", async () => {
		vi.mocked(processSocialMediaSignals).mockResolvedValue({
			signals: sampleSignals,
			topPostsForPrompt: [sampleScoredPost],
			topPostsForReport: [sampleScoredPost],
			stats: {
				fetched: 1,
				newlyScored: 1,
				skippedAlreadyScored: 0,
			},
		});

		const config = loadTestConfig({ SOCIAL_MEDIA_ENABLED: "true" });
		const assets = getAnalyzableAssets(config);
		const section = await socialMediaSource.fetch(config, assets);

		expect(section.payload).toEqual({
			signals: sampleSignals,
			topPostsForPrompt: [sampleScoredPost],
			topPostsForReport: [sampleScoredPost],
			scoringStats: {
				fetched: 1,
				newlyScored: 1,
				skippedAlreadyScored: 0,
			},
		});
		expect(section.promptText).toContain("[score=9] @whale_alert");
		expect(processSocialMediaSignals).toHaveBeenCalledWith(
			config,
			{},
			expect.objectContaining({ outlookAssets: ["BTC", "ETH", "SOL"] }),
		);
	});

	it("passes a fresh macro briefing into scoring", async () => {
		const generatedAt = new Date("2026-06-16T07:00:00.000Z");
		vi.mocked(processSocialMediaSignals).mockResolvedValue({
			signals: sampleSignals,
			topPostsForPrompt: [sampleScoredPost],
			topPostsForReport: [sampleScoredPost],
			stats: {
				fetched: 1,
				newlyScored: 1,
				skippedAlreadyScored: 0,
			},
		});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

		const config = loadTestConfig({ SOCIAL_MEDIA_ENABLED: "true" });
		const assets = getAnalyzableAssets(config);
		await socialMediaSource.fetch(config, assets, {
			marketContext: {
				content: "Risk-off ahead of CPI.",
				generatedAt,
			},
		});

		expect(processSocialMediaSignals).toHaveBeenCalledWith(
			config,
			{},
			{
				outlookAssets: ["BTC", "ETH", "SOL"],
				marketContext: {
					content: "Risk-off ahead of CPI.",
					generatedAt,
				},
			},
		);
		expect(infoSpy).toHaveBeenCalledWith(
			"Social media: using macro briefing from 2026-06-16T07:00:00.000Z",
		);

		infoSpy.mockRestore();
	});

	it("falls back to an empty section when scoring fails", async () => {
		vi.mocked(processSocialMediaSignals).mockRejectedValue(
			new Error("LLM down"),
		);
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const config = loadTestConfig({ SOCIAL_MEDIA_ENABLED: "true" });
		const assets = getAnalyzableAssets(config);
		const section = await socialMediaSource.fetch(config, assets);

		expect(section.payload).toEqual({ signals: [] });
		expect(section.promptText).toContain(
			"No scored social media posts met the relevance threshold",
		);
		expect(warnSpy).toHaveBeenCalledWith(
			"Social media scoring failed; falling back to empty section: LLM down",
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
				marketContextLoader: async () => undefined,
			}),
		).rejects.toThrow("No analysis data sources produced sections");

		expect(processSocialMediaSignals).not.toHaveBeenCalled();
	});
});
