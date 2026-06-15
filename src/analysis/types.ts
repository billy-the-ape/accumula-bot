import type { AppConfig } from "@/config/index.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";

export type AnalysisSection<TPayload = unknown> = {
	sourceId: string;
	label: string;
	promptText: string;
	payload: TPayload;
};

export type AnalysisContext = {
	fetchedAt: string;
	sections: AnalysisSection[];
};

export interface AnalysisDataSource<TPayload = unknown> {
	readonly id: string;
	isEnabled(config: AppConfig): boolean;
	fetch(
		config: AppConfig,
		assets: readonly Cryptocurrency[],
	): Promise<AnalysisSection<TPayload>>;
}
