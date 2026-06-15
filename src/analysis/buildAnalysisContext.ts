import { marketDataSource } from "@/analysis/sources/marketDataSource.js";
import { predictionMarketSource } from "@/analysis/sources/predictionMarketSource.js";
import type {
	AnalysisContext,
	AnalysisDataSource,
	AnalysisSection,
} from "@/analysis/types.js";
import type { AppConfig } from "@/config/index.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";

// Order matters: sections are rendered into the prompt in this order. Sources
// gated off by `isEnabled` (e.g. prediction markets default to off via
// `PREDICTION_MARKETS_ENABLED`) are skipped at fetch time.
export const DEFAULT_ANALYSIS_DATA_SOURCES: readonly AnalysisDataSource[] = [
	marketDataSource,
	predictionMarketSource,
];

export type BuildAnalysisContextOptions = {
	sources?: readonly AnalysisDataSource[];
};

async function fetchEnabledSections(
	config: AppConfig,
	assets: readonly Cryptocurrency[],
	sources: readonly AnalysisDataSource[],
): Promise<AnalysisSection[]> {
	const sections: AnalysisSection[] = [];

	for (const source of sources) {
		if (!source.isEnabled(config)) {
			continue;
		}

		sections.push(await source.fetch(config, assets));
	}

	return sections;
}

export async function buildAnalysisContext(
	config: AppConfig,
	assets: readonly Cryptocurrency[],
	options: BuildAnalysisContextOptions = {},
): Promise<AnalysisContext> {
	const sources = options.sources ?? DEFAULT_ANALYSIS_DATA_SOURCES;
	const sections = await fetchEnabledSections(config, assets, sources);

	if (sections.length === 0) {
		throw new Error("No analysis data sources produced sections");
	}

	return {
		fetchedAt: new Date().toISOString(),
		sections,
	};
}
