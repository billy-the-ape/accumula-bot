import type { AppConfig } from "@/config/index.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";

export type AnalysisSection = {
	sourceId: string;
	label: string;
	promptText: string;
	payload: unknown;
};

export type AnalysisContext = {
	fetchedAt: string;
	sections: AnalysisSection[];
};

export interface AnalysisDataSource {
	readonly id: string;
	isEnabled(config: AppConfig): boolean;
	fetch(
		config: AppConfig,
		assets: readonly Cryptocurrency[],
	): Promise<AnalysisSection>;
}
