import type { AnalysisContext } from "@/analysis/types.js";
import type { AppConfig } from "@/config/index.js";
import { completeJsonChat } from "@/llm/llmClient.js";
import {
	extractThinkingText,
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

export type LlmAnalysisMetadata = {
	rawResponse: string;
	thinking?: string;
	attempt: "initial" | "retry";
};

export type AnalysisResult = {
	recommendation: TradeRecommendation;
	llm: LlmAnalysisMetadata;
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

function buildAnalysisMetadata(
	rawResponse: string,
	attempt: LlmAnalysisMetadata["attempt"],
): LlmAnalysisMetadata {
	const thinking = extractThinkingText(rawResponse);

	return {
		rawResponse,
		attempt,
		...(thinking ? { thinking } : {}),
	};
}

export async function runAnalysis(
	config: AppConfig,
	context: AnalysisContext,
	options: RunAnalysisOptions = {},
): Promise<AnalysisResult> {
	const outlookAssets = getAnalyzableAssets(config).map(
		(asset) => asset.symbol,
	);
	const validation: TradeRecommendationValidation = {
		outlookAssets,
	};
	const prompt = buildAnalysisPromptParts(config, context, outlookAssets);

	console.info(`Trade LLM Analysis:  prompt=${prompt.user.length} chars...`);

	const chatOptions = {
		...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
		...(config.verbosePromptLogs
			? {
					verbosePromptLogs: true,
					verbosePromptLabel: "trade-recommendation",
				}
			: {}),
	};

	const rawResponse = await completeJsonChat(config.llm, prompt, chatOptions);

	try {
		const recommendation = parseRecommendationOrThrow(
			rawResponse,
			validation,
			"initial",
		);
		return {
			recommendation,
			llm: buildAnalysisMetadata(rawResponse, "initial"),
		};
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
		const retryResponse = await completeJsonChat(config.llm, repairPrompt, {
			...chatOptions,
			verbosePromptLabel: "trade-recommendation-repair",
		});
		const recommendation = parseRecommendationOrThrow(
			retryResponse,
			validation,
			"retry",
		);

		return {
			recommendation,
			llm: buildAnalysisMetadata(retryResponse, "retry"),
		};
	}
}
