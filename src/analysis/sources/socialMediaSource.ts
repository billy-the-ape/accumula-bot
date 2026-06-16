import type { SocialMediaSectionPayload } from "@/analysis/socialMediaSectionPayload.js";
import type { AppConfig } from "@/config/index.js";
import { analyzeSocialMedia } from "@/llm/analyzeSocialMedia.js";
import type { AnalysisDataSource } from "@/llm/index.js";
import { getAnalyzableAssets } from "@/llm/prompt.js";
import { collectSocialMediaSignals } from "@/sources/social_media/collectSocialMediaSignals.js";
import { formatSocialMediaAnalysis } from "@/sources/social_media/formatSocialMediaAnalysis.js";
import { formatSocialMediaSignals } from "@/sources/social_media/formatSocialMediaSignals.js";

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

			try {
				const { analysis } = await analyzeSocialMedia(config, signals, {
					outlookAssets,
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
