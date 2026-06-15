import type { AppConfig } from "@/config";
import type { AnalysisDataSource } from "@/llm";
import { collectSocialMediaSignals } from "@/sources/social_media/collectSocialMediaSignals";
import { formatSocialMediaSignals } from "@/sources/social_media/formatSocialMediaSignals";

export const socialMediaSource: AnalysisDataSource = {
	id: "social_media",
	isEnabled: () => true,
	fetch: async (config: AppConfig) => {
		const signals = await collectSocialMediaSignals(config);
		return {
			sourceId: "social_media",
			label: "Social media",
			payload: signals,
			promptText: formatSocialMediaSignals(signals),
		};
	},
};
