import type { SocialMediaSectionPayload } from "@/analysis/socialMediaSectionPayload.js";
import type { AppConfig } from "@/config/index.js";
import { analyzeSocialMedia } from "@/llm/analyzeSocialMedia.js";
import type { AnalysisDataSource } from "@/llm/index.js";
import { getAnalyzableAssets } from "@/llm/prompt.js";
import { loadFreshMarketContext } from "@/macro/resolveMarketContext.js";
import { collectSocialMediaSignals } from "@/sources/social_media/collectSocialMediaSignals.js";
import { formatSocialMediaAnalysis } from "@/sources/social_media/formatSocialMediaAnalysis.js";
import { formatSocialMediaSignals } from "@/sources/social_media/formatSocialMediaSignals.js";
import { createDatabase } from "@/storage/db.js";

export const socialMediaSource: AnalysisDataSource<SocialMediaSectionPayload> =
	{
		id: "social_media",

		isEnabled(config: AppConfig): boolean {
			return config.socialMedia.enabled;
		},

		fetch: async (config, _assets) => {
			const signals = await collectSocialMediaSignals(config);
			const outlookAssets = getAnalyzableAssets(config).map(
				(asset) => asset.symbol,
			);

			const connection = await createDatabase(config.databasePath);
			let marketContext: Awaited<ReturnType<typeof loadFreshMarketContext>>;
			try {
				marketContext = await loadFreshMarketContext(connection.db);
				if (marketContext) {
					console.info(
						`Social media: using macro briefing from ${marketContext.generatedAt.toISOString()}`,
					);
				} else {
					console.info(
						"Social media: no fresh macro briefing available; Stage 1 runs without market context",
					);
				}
			} finally {
				connection.client.close();
			}

			try {
				const { analysis } = await analyzeSocialMedia(config, signals, {
					outlookAssets,
					...(marketContext ? { marketContext } : {}),
				});

				return {
					sourceId: "social_media",
					label: "Social media",
					payload: { signals, analysis },
					promptText: formatSocialMediaAnalysis(analysis, signals),
				};
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "unknown error";

				console.warn(
					`Social media analysis failed; falling back to raw posts: ${message}`,
				);

				return {
					sourceId: "social_media",
					label: "Social media",
					payload: { signals },
					promptText: formatSocialMediaSignals(signals),
				};
			}
		},
	};
