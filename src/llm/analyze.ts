import type { AppConfig } from "@/config/index.js";
import { completeJsonChat } from "@/llm/llmClient.js";
import type { AssetMarketSnapshot } from "@/llm/marketSnapshot.js";
import { parseTradeRecommendationJson } from "@/llm/parseResponse.js";
import { buildAnalysisPrompt } from "@/llm/prompt.js";
import type {
	TradeRecommendation,
	TradeRecommendationValidation,
} from "@/schemas/TradeRecommendation.js";

export type RunAnalysisOptions = {
	fetchImpl?: typeof fetch;
};

export async function runAnalysis(
	config: AppConfig,
	marketData: AssetMarketSnapshot[],
	options: RunAnalysisOptions = {},
): Promise<TradeRecommendation> {
	const validation: TradeRecommendationValidation = {
		rankingAssets: marketData.map((snapshot) => snapshot.asset),
		recommendedAssets: config.assetTradeable.map((asset) => asset.symbol),
	};
	const prompt = buildAnalysisPrompt(config, marketData);

	const rawResponse = await completeJsonChat(config.llm, prompt, {
		...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
	});
	return parseTradeRecommendationJson(rawResponse, validation);
}
