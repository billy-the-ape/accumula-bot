import type { AppConfig } from "@/config/index.js";
import { completeJsonChat } from "@/llm/llmClient.js";
import { ParseResponseError } from "@/llm/parseResponse.js";
import { parseSocialMediaRelevanceBatchJson } from "@/llm/parseSocialMediaRelevanceBatch.js";
import { LlmError } from "@/llm/providers/types.js";
import {
	createBatchLocalPostIdValidation,
	mapBatchLocalPostIdsToGlobal,
} from "@/llm/relevanceBatchPostIds.js";
import { salvageRelevantPostIds } from "@/llm/salvageRelevantPostIds.js";
import type { SocialMediaMarketContext } from "@/llm/socialMediaRelevancePrompt.js";
import {
	buildSocialMediaRelevancePromptParts,
	buildSocialMediaRelevanceRepairPromptParts,
} from "@/llm/socialMediaRelevancePrompt.js";
import { createSocialMediaRelevanceBatchValidation } from "@/schemas/SocialMediaRelevanceBatch.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { prefilterSocialMediaSignalsForRelevance } from "@/sources/social_media/prefilterSocialMediaSignalsForRelevance.js";
import { formatDuration } from "@/utils";

export const DEFAULT_SOCIAL_MEDIA_RELEVANCE_BATCH_SIZE = 40;

export type FindRelevantSocialMediaSignalsOptions = {
	fetchImpl?: typeof fetch;
	outlookAssets: readonly string[];
	marketContext?: SocialMediaMarketContext;
	batchSize?: number;
};

export type FindRelevantSocialMediaSignalsResult = {
	relevantSignals: SocialMediaSignal[];
	scannedCount: number;
	durationMs: number;
};

export function splitSocialMediaSignalsIntoBatches(
	signals: readonly SocialMediaSignal[],
	batchSize: number,
): SocialMediaSignal[][] {
	if (batchSize <= 0) {
		throw new Error(`batchSize must be positive, got ${batchSize}`);
	}

	const batches: SocialMediaSignal[][] = [];
	for (let index = 0; index < signals.length; index += batchSize) {
		batches.push(
			signals.slice(index, index + batchSize) as SocialMediaSignal[],
		);
	}
	return batches;
}

function logBatchParseFailure(
	batchLabel: string,
	attemptLabel: "initial" | "retry",
	error: ParseResponseError,
	rawResponse: string,
): void {
	console.error(
		`Social media relevance ${batchLabel} ${attemptLabel} response parse failed: ${error.message}`,
	);
	console.error(
		`Social media relevance ${batchLabel} ${attemptLabel} raw output:\n${rawResponse}`,
	);
}

function isEmptyLlmResponseError(error: unknown): boolean {
	return (
		error instanceof LlmError &&
		error.message.toLowerCase().includes("empty response")
	);
}

async function completeJsonChatWithEmptyRetry(
	config: AppConfig["llm"],
	prompt: ReturnType<typeof buildSocialMediaRelevancePromptParts>,
	chatOptions: { fetchImpl?: typeof fetch },
): Promise<string> {
	try {
		return await completeJsonChat(config, prompt, {
			...chatOptions,
			fast: true,
			reasoningEffort: "minimal",
		});
	} catch (error) {
		if (!isEmptyLlmResponseError(error)) {
			throw error;
		}

		console.info(
			"Social media relevance: LLM returned an empty response; retrying once...",
		);
		return await completeJsonChat(config, prompt, chatOptions);
	}
}

async function parseBatchOrRepair(
	config: AppConfig["llm"],
	prompt: ReturnType<typeof buildSocialMediaRelevancePromptParts>,
	batchSignals: readonly SocialMediaSignal[],
	batchLabel: string,
	chatOptions: { fetchImpl?: typeof fetch },
): Promise<number[]> {
	const validation = createSocialMediaRelevanceBatchValidation(
		createBatchLocalPostIdValidation(batchSignals.length),
	);
	const rawResponse = await completeJsonChatWithEmptyRetry(
		config,
		prompt,
		chatOptions,
	);

	const toGlobalIds = (localIds: readonly number[]) =>
		mapBatchLocalPostIdsToGlobal(localIds, batchSignals);

	try {
		const parsed = parseSocialMediaRelevanceBatchJson(rawResponse, validation);
		return toGlobalIds(parsed.relevant_post_ids);
	} catch (error) {
		if (!(error instanceof ParseResponseError)) {
			throw error;
		}

		const salvagedLocalIds = salvageRelevantPostIds(rawResponse, validation);
		if (salvagedLocalIds !== null) {
			console.warn(
				`Social media relevance ${batchLabel}: dropped hallucinated post_id values; kept ${salvagedLocalIds.length}`,
			);
			return toGlobalIds(salvagedLocalIds);
		}

		logBatchParseFailure(batchLabel, "initial", error, rawResponse);

		console.info(
			`Social media relevance ${batchLabel}: retrying with JSON repair prompt...`,
		);
		const repairPrompt = buildSocialMediaRelevanceRepairPromptParts(
			prompt,
			error.message,
			rawResponse,
			batchSignals,
		);

		try {
			const retryResponse = await completeJsonChat(config, repairPrompt, {
				...chatOptions,
				fast: true,
				reasoningEffort: "minimal",
			});
			try {
				const parsed = parseSocialMediaRelevanceBatchJson(
					retryResponse,
					validation,
				);
				return toGlobalIds(parsed.relevant_post_ids);
			} catch (retryError) {
				const salvagedRetryIds = salvageRelevantPostIds(
					retryResponse,
					validation,
				);
				if (salvagedRetryIds !== null) {
					console.warn(
						`Social media relevance ${batchLabel}: salvage after repair dropped invalid post_id values; kept ${salvagedRetryIds.length}`,
					);
					return toGlobalIds(salvagedRetryIds);
				}

				if (retryError instanceof ParseResponseError) {
					logBatchParseFailure(batchLabel, "retry", retryError, retryResponse);
				}
				throw retryError;
			}
		} catch (retryError) {
			if (!(retryError instanceof ParseResponseError)) {
				throw retryError;
			}

			console.warn(
				`Social media relevance ${batchLabel}: parse failed after retry; treating as 0 relevant`,
			);
			return [];
		}
	}
}

export async function findRelevantSocialMediaSignals(
	config: AppConfig,
	signals: readonly SocialMediaSignal[],
	options: FindRelevantSocialMediaSignalsOptions,
): Promise<FindRelevantSocialMediaSignalsResult> {
	const start = Date.now();
	const batchSize =
		options.batchSize ?? DEFAULT_SOCIAL_MEDIA_RELEVANCE_BATCH_SIZE;

	if (signals.length === 0) {
		console.info(
			`Social media relevance filter skipped (0 posts) in ${formatDuration(Date.now() - start)}`,
		);
		return {
			relevantSignals: [],
			scannedCount: 0,
			durationMs: Date.now() - start,
		};
	}

	const { candidates: llmCandidates, excludedCount } =
		prefilterSocialMediaSignalsForRelevance(signals, options.outlookAssets);

	if (excludedCount > 0) {
		console.info(
			`Social media: heuristic pre-filter excluded ${excludedCount} of ${signals.length} posts before LLM`,
		);
	}

	if (llmCandidates.length === 0) {
		const durationMs = Date.now() - start;
		console.info(
			`Social media relevance filter skipped (0 LLM candidates after pre-filter) in ${formatDuration(durationMs)}`,
		);
		return {
			relevantSignals: [],
			scannedCount: signals.length,
			durationMs,
		};
	}

	const batches = splitSocialMediaSignalsIntoBatches(llmCandidates, batchSize);
	const batchCount = batches.length;
	const chatOptions = {
		...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
	};

	console.info(
		`Social media: relevance filter — ${batchCount} batches × ${batchSize} posts (sequential)`,
	);

	const relevantSignals: SocialMediaSignal[] = [];

	for (const [batchIndex, batchSignals] of batches.entries()) {
		const batchNumber = batchIndex + 1;
		const batchLabel = `batch ${batchNumber}/${batchCount}`;
		const batchStart = Date.now();

		const prompt = buildSocialMediaRelevancePromptParts({
			batchSignals,
			batchNumber,
			batchCount,
			outlookAssets: options.outlookAssets,
			...(options.marketContext
				? { marketContext: options.marketContext }
				: {}),
		});

		const relevantIndices = await parseBatchOrRepair(
			config.llm,
			prompt,
			batchSignals,
			batchLabel,
			chatOptions,
		);

		for (const signal of relevantIndices.map((index) =>
			signals.find((signal) => signal.index === index),
		)) {
			if (signal) {
				relevantSignals.push(signal);
			}
		}

		console.info(
			`Social media relevance ${batchLabel} — ${relevantIndices.length} relevant of ${batchSignals.length}`,
			`${formatDuration(Date.now() - batchStart)}`,
		);
	}
	const durationMs = Date.now() - start;

	console.info(
		`Social media: relevance filter done — ${relevantSignals.length} relevant of ${
			signals.length
		} scanned in ${formatDuration(durationMs)}`,
	);

	return {
		relevantSignals,
		scannedCount: signals.length,
		durationMs,
	};
}
