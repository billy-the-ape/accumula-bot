import type { AppConfig } from "@/config/index.js";
import { completeJsonChat } from "@/llm/llmClient.js";
import {
	extractThinkingText,
	ParseResponseError,
} from "@/llm/parseResponse.js";
import { parseSocialMediaAnalysisJson } from "@/llm/parseSocialMediaAnalysis.js";
import { LlmError } from "@/llm/providers/types.js";
import type { SocialMediaMarketContext } from "@/llm/socialMediaPrompt.js";
import {
	buildSocialMediaAnalysisPromptParts,
	buildSocialMediaRepairPromptParts,
} from "@/llm/socialMediaPrompt.js";
import {
	createSocialMediaAnalysisValidation,
	type SocialMediaAnalysis,
} from "@/schemas/SocialMediaAnalysis.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { capSocialMediaPromptSignalsPerAccount } from "@/sources/social_media/capSocialMediaPromptSignalsPerAccount.js";
import { orderSocialMediaPromptSignals } from "@/sources/social_media/orderSocialMediaPromptSignals.js";
import { prefilterSocialMediaSignalsForRelevance } from "@/sources/social_media/prefilterSocialMediaSignalsForRelevance.js";
import { selectSocialMediaPromptSignals } from "@/sources/social_media/selectSocialMediaPromptSignals.js";
import { formatDuration } from "@/utils";

export type AnalyzeSocialMediaOptions = {
	fetchImpl?: typeof fetch;
	outlookAssets?: readonly string[];
	marketContext?: SocialMediaMarketContext;
};

export type SocialMediaAnalysisMetadata = {
	rawResponse: string;
	thinking?: string;
	attempt: "initial" | "retry" | "skipped";
};

export type AnalyzeSocialMediaResult = {
	analysis: SocialMediaAnalysis;
	llm: SocialMediaAnalysisMetadata;
};

const EMPTY_ANALYSIS: SocialMediaAnalysis = {
	total_retrieved: 0,
	relevant_count: 0,
	summary: "No social media posts retrieved.",
	themes: [],
	by_asset: [],
	top_posts: [],
};

function buildZeroRelevantAnalysis(
	totalRetrieved: number,
): SocialMediaAnalysis {
	return {
		total_retrieved: totalRetrieved,
		relevant_count: 0,
		summary: "- No material headlines for outlook assets in this batch.",
		themes: [],
		by_asset: [],
		top_posts: [],
	};
}

function logParseFailure(
	attemptLabel: "initial" | "retry",
	error: ParseResponseError,
	rawResponse: string,
): void {
	console.error(
		`Social media analysis ${attemptLabel} response parse failed: ${error.message}`,
	);
	console.error(
		`Social media analysis ${attemptLabel} raw output:\n${rawResponse}`,
	);
}

function parseAnalysisOrThrow(
	rawResponse: string,
	validation: ReturnType<typeof createSocialMediaAnalysisValidation>,
	attemptLabel: "initial" | "retry",
): SocialMediaAnalysis {
	try {
		return parseSocialMediaAnalysisJson(rawResponse, validation);
	} catch (error) {
		if (error instanceof ParseResponseError) {
			logParseFailure(attemptLabel, error, rawResponse);
		}

		throw error;
	}
}

function buildAnalysisMetadata(
	rawResponse: string,
	attempt: SocialMediaAnalysisMetadata["attempt"],
): SocialMediaAnalysisMetadata {
	const thinking = extractThinkingText(rawResponse);

	return {
		rawResponse,
		attempt,
		...(thinking ? { thinking } : {}),
	};
}

function isEmptyLlmResponseError(error: unknown): boolean {
	return (
		error instanceof LlmError &&
		error.message.toLowerCase().includes("empty response")
	);
}

async function completeJsonChatWithEmptyRetry(
	config: AppConfig["llm"],
	prompt: ReturnType<typeof buildSocialMediaAnalysisPromptParts>,
	chatOptions: { fetchImpl?: typeof fetch },
): Promise<{ rawResponse: string; llmAttempt: "initial" | "retry" }> {
	try {
		const rawResponse = await completeJsonChat(config, prompt, chatOptions);
		return { rawResponse, llmAttempt: "initial" };
	} catch (error) {
		if (!isEmptyLlmResponseError(error)) {
			throw error;
		}

		console.info(
			"Social media analysis: LLM returned an empty response; retrying once...",
		);

		const rawResponse = await completeJsonChat(config, prompt, chatOptions);
		return { rawResponse, llmAttempt: "retry" };
	}
}

export async function analyzeSocialMedia(
	config: AppConfig,
	signals: readonly SocialMediaSignal[],
	options: AnalyzeSocialMediaOptions = {},
): Promise<AnalyzeSocialMediaResult> {
	const start = Date.now();

	if (signals.length === 0) {
		console.info(
			`Social media analysis skipped (0 posts) in ${formatDuration(Date.now() - start)}`,
		);

		return {
			analysis: EMPTY_ANALYSIS,
			llm: buildAnalysisMetadata("", "skipped"),
		};
	}

	const outlookAssets =
		options.outlookAssets ??
		config.assetTradeable
			.filter((asset) => !asset.isStable)
			.map((asset) => asset.symbol);

	const scannedSignals = selectSocialMediaPromptSignals(signals);

	if (scannedSignals.length < signals.length) {
		console.info(
			`Social media: analysis prompt includes ${scannedSignals.length} of ${signals.length} posts (newest first)`,
		);
	}

	const { candidates: prefilteredSignals, excludedCount } =
		prefilterSocialMediaSignalsForRelevance(scannedSignals, outlookAssets);

	if (excludedCount > 0) {
		console.info(
			`Social media: heuristic pre-filter excluded ${excludedCount} of ${scannedSignals.length} posts before LLM`,
		);
	}

	const promptSignals = orderSocialMediaPromptSignals(
		capSocialMediaPromptSignalsPerAccount(prefilteredSignals),
	);

	if (promptSignals.length < prefilteredSignals.length) {
		console.info(
			`Social media: per-account cap reduced prompt from ${prefilteredSignals.length} to ${promptSignals.length} posts`,
		);
	}

	if (promptSignals.length === 0) {
		console.info(
			`Social media analysis completed in ${formatDuration(Date.now() - start)} (0 LLM candidates after pre-filter, relevant=0/${signals.length})`,
		);

		return {
			analysis: buildZeroRelevantAnalysis(signals.length),
			llm: buildAnalysisMetadata("", "skipped"),
		};
	}

	const validation = createSocialMediaAnalysisValidation(
		signals,
		promptSignals,
	);
	const prompt = buildSocialMediaAnalysisPromptParts({
		promptSignals,
		totalRetrieved: signals.length,
		outlookAssets,
		...(options.marketContext ? { marketContext: options.marketContext } : {}),
	});

	const chatOptions = {
		...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
		...(config.verbosePromptLogs
			? {
					verbosePromptLogs: true,
					verbosePromptLabel: "social-media-analysis",
				}
			: {}),
	};

	console.info(
		`Social media: running analysis on ${promptSignals.length} posts (prompt=${prompt.user.length} chars)...`,
	);

	const { rawResponse, llmAttempt } = await completeJsonChatWithEmptyRetry(
		config.llm,
		prompt,
		chatOptions,
	);

	try {
		const analysis = parseAnalysisOrThrow(rawResponse, validation, "initial");

		console.info(
			`Social media analysis completed in ${formatDuration(Date.now() - start)} (informative=${analysis.relevant_count}/${analysis.total_retrieved})`,
		);

		return {
			analysis,
			llm: buildAnalysisMetadata(rawResponse, llmAttempt),
		};
	} catch (error) {
		if (!(error instanceof ParseResponseError)) {
			throw error;
		}

		console.info("Retrying social media analysis with a JSON repair prompt...");

		const repairPrompt = buildSocialMediaRepairPromptParts(
			prompt,
			error.message,
			rawResponse,
			promptSignals,
		);

		const retryResponse = await completeJsonChat(config.llm, repairPrompt, {
			...chatOptions,
			verbosePromptLabel: "social-media-analysis-repair",
		});

		const analysis = parseAnalysisOrThrow(retryResponse, validation, "retry");

		console.info(
			`Social media analysis completed in ${formatDuration(Date.now() - start)} (informative=${analysis.relevant_count}/${analysis.total_retrieved})`,
		);

		return {
			analysis,
			llm: buildAnalysisMetadata(retryResponse, "retry"),
		};
	}
}
