import type { SocialMediaSectionPayload } from "@/analysis/socialMediaSectionPayload.js";
import type { AnalysisFetchOptions } from "@/analysis/types.js";
import type { AppConfig } from "@/config/index.js";
import type { AnalysisDataSource } from "@/llm/index.js";
import { getAnalyzableAssets } from "@/llm/prompt.js";
import { formatScoredSocialMediaPosts } from "@/sources/social_media/formatScoredSocialMediaPosts.js";
import { processSocialMediaSignals } from "@/sources/social_media/processSocialMediaSignals.js";
import { createDatabase } from "@/storage/db.js";

export const socialMediaSource: AnalysisDataSource<SocialMediaSectionPayload> =
	{
		id: "social_media",

		isEnabled(config: AppConfig): boolean {
			return config.socialMedia.enabled;
		},

		fetch: async (config, _assets, options: AnalysisFetchOptions = {}) => {
			const outlookAssets = getAnalyzableAssets(config).map(
				(asset) => asset.symbol,
			);
			const marketContext = options.marketContext;

			if (marketContext) {
				console.info(
					`Social media: using macro briefing from ${marketContext.generatedAt.toISOString()}`,
				);
			} else {
				console.info(
					"Social media: no fresh macro briefing available; scoring runs without market context",
				);
			}

			const connection = await createDatabase(config.databasePath);

			try {
				const result = await processSocialMediaSignals(config, connection.db, {
					outlookAssets,
					...(marketContext ? { marketContext } : {}),
				});

				return {
					sourceId: "social_media",
					label: "Social media",
					payload: {
						signals: result.signals,
						topPostsForPrompt: result.topPostsForPrompt,
						topPostsForReport: result.topPostsForReport,
						scoringStats: result.stats,
					},
					promptText: formatScoredSocialMediaPosts(result.topPostsForPrompt),
				};
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "unknown error";

				console.warn(
					`Social media scoring failed; falling back to empty section: ${message}`,
				);

				return {
					sourceId: "social_media",
					label: "Social media",
					payload: { signals: [] },
					promptText: formatScoredSocialMediaPosts([]),
				};
			} finally {
				connection.client.close();
			}
		},
	};
