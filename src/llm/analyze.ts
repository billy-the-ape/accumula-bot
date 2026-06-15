import type { AnalysisContext } from "@/analysis/types.js";
import type { AppConfig } from "@/config/index.js";
import { completeJsonChat } from "@/llm/llmClient.js";
import {
	ParseResponseError,
	parseTradeRecommendationJson,
} from "@/llm/parseResponse.js";
import {
	buildAnalysisPromptParts,
	buildRepairPromptParts,
	getAnalyzableAssets,
} from "@/llm/prompt.js";
import type {
	TradeRecommendation,
	TradeRecommendationValidation,
} from "@/schemas/TradeRecommendation.js";

export type RunAnalysisOptions = {
	fetchImpl?: typeof fetch;
};

function logParseFailure(
	attemptLabel: "initial" | "retry",
	error: ParseResponseError,
	rawResponse: string,
): void {
	console.error(`LLM ${attemptLabel} response parse failed: ${error.message}`);
	console.error(`LLM ${attemptLabel} raw output:\n${rawResponse}`);
}

function parseRecommendationOrThrow(
	rawResponse: string,
	validation: TradeRecommendationValidation,
	attemptLabel: "initial" | "retry",
): TradeRecommendation {
	try {
		return parseTradeRecommendationJson(rawResponse, validation);
	} catch (error) {
		if (error instanceof ParseResponseError) {
			logParseFailure(attemptLabel, error, rawResponse);
		}

		throw error;
	}
}

export async function runAnalysis(
	config: AppConfig,
	context: AnalysisContext,
	options: RunAnalysisOptions = {},
): Promise<TradeRecommendation> {
	const outlookAssets = getAnalyzableAssets(config).map(
		(asset) => asset.symbol,
	);
	const validation: TradeRecommendationValidation = {
		outlookAssets,
	};
	const prompt = buildAnalysisPromptParts(config, context, outlookAssets);
	const chatOptions = {
		...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
	};

	const rawResponse = await completeJsonChat(config.llm, prompt, chatOptions);

	try {
		return parseRecommendationOrThrow(rawResponse, validation, "initial");
	} catch (error) {
		if (!(error instanceof ParseResponseError)) {
			throw error;
		}

		console.info("Retrying LLM analysis with a JSON repair prompt...");
		const repairPrompt = buildRepairPromptParts(
			prompt,
			error.message,
			rawResponse,
		);
		const retryResponse = await completeJsonChat(
			config.llm,
			repairPrompt,
			chatOptions,
		);

		return parseRecommendationOrThrow(retryResponse, validation, "retry");
	}
}
