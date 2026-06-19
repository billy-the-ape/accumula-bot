import type { AppConfig } from "@/config/index.js";
import type { SocialMediaMarketContext } from "@/llm/socialMediaPromptShared.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";

export type AnalysisSection<TPayload = unknown> = {
	sourceId: string;
	label: string;
	promptText: string;
	payload: TPayload;
};

export type AnalysisFetchOptions = {
	marketContext?: SocialMediaMarketContext;
};

export type AnalysisContext = {
	fetchedAt: string;
	sections: AnalysisSection[];
	marketContext?: SocialMediaMarketContext;
};

export interface AnalysisDataSource<TPayload = unknown> {
	readonly id: string;
	isEnabled(config: AppConfig): boolean;
	fetch(
		config: AppConfig,
		assets: readonly Cryptocurrency[],
		options?: AnalysisFetchOptions,
	): Promise<AnalysisSection<TPayload>>;
}
