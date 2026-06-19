import { marketDataSource } from "@/analysis/sources/marketDataSource.js";
import { predictionMarketSource } from "@/analysis/sources/predictionMarketSource.js";
import { socialMediaSource } from "@/analysis/sources/socialMediaSource";
import type {
	AnalysisContext,
	AnalysisDataSource,
	AnalysisSection,
} from "@/analysis/types.js";
import type { AppConfig } from "@/config/index.js";
import type { SocialMediaMarketContext } from "@/llm/socialMediaPromptShared.js";
import { loadMarketContextFromConfig } from "@/macro/resolveMarketContext.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";

// Order matters: sections are rendered into the prompt in this order. Sources
// gated off by `isEnabled` (e.g. prediction markets default to off via
// `PREDICTION_MARKETS_ENABLED`) are skipped at fetch time.
export const DEFAULT_ANALYSIS_DATA_SOURCES: readonly AnalysisDataSource[] = [
	marketDataSource,
	predictionMarketSource,
	socialMediaSource,
];

export type BuildAnalysisContextOptions = {
	sources?: readonly AnalysisDataSource[];
	marketContextLoader?: (
		config: AppConfig,
	) => Promise<SocialMediaMarketContext | undefined>;
};

async function fetchEnabledSections(
	config: AppConfig,
	assets: readonly Cryptocurrency[],
	sources: readonly AnalysisDataSource[],
	marketContext?: SocialMediaMarketContext,
): Promise<AnalysisSection[]> {
	const sections: AnalysisSection[] = [];
	const fetchOptions = marketContext ? { marketContext } : {};

	for (const source of sources) {
		if (!source.isEnabled(config)) {
			continue;
		}

		sections.push(await source.fetch(config, assets, fetchOptions));
	}

	return sections;
}

export async function buildAnalysisContext(
	config: AppConfig,
	assets: readonly Cryptocurrency[],
	options: BuildAnalysisContextOptions = {},
): Promise<AnalysisContext> {
	const sources = options.sources ?? DEFAULT_ANALYSIS_DATA_SOURCES;
	const marketContextLoader =
		options.marketContextLoader ?? loadMarketContextFromConfig;
	const marketContext = await marketContextLoader(config);

	if (marketContext) {
		console.info(
			`Analysis: using macro briefing from ${marketContext.generatedAt.toISOString()}`,
		);
	} else {
		console.info("Analysis: no fresh macro briefing available");
	}

	const sections = await fetchEnabledSections(
		config,
		assets,
		sources,
		marketContext,
	);

	if (sections.length === 0) {
		throw new Error("No analysis data sources produced sections");
	}

	return {
		fetchedAt: new Date().toISOString(),
		sections,
		...(marketContext ? { marketContext } : {}),
	};
}
