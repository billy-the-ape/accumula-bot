import type { AppConfig } from "@/config/index.js";
import { completeJsonChat } from "@/llm/llmClient.js";
import { ParseResponseError } from "@/llm/parseResponse.js";
import { parseSocialMediaRelevanceBatchJson } from "@/llm/parseSocialMediaRelevanceBatch.js";
import { LlmError } from "@/llm/providers/types.js";
import type { SocialMediaMarketContext } from "@/llm/socialMediaRelevancePrompt.js";
import {
	buildSocialMediaRelevancePromptParts,
	buildSocialMediaRelevanceRepairPromptParts,
} from "@/llm/socialMediaRelevancePrompt.js";
import { createSocialMediaRelevanceBatchValidation } from "@/schemas/SocialMediaRelevanceBatch.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";

export const DEFAULT_SOCIAL_MEDIA_RELEVANCE_BATCH_SIZE = 20;

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
		return await completeJsonChat(config, prompt, chatOptions);
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
	const validation = createSocialMediaRelevanceBatchValidation(batchSignals);
	const rawResponse = await completeJsonChatWithEmptyRetry(
		config,
		prompt,
		chatOptions,
	);

	try {
		const parsed = parseSocialMediaRelevanceBatchJson(rawResponse, validation);
		return parsed.relevant_post_indices;
	} catch (error) {
		if (!(error instanceof ParseResponseError)) {
			throw error;
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
			const retryResponse = await completeJsonChat(
				config,
				repairPrompt,
				chatOptions,
			);
			try {
				const parsed = parseSocialMediaRelevanceBatchJson(
					retryResponse,
					validation,
				);
				return parsed.relevant_post_indices;
			} catch (retryError) {
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

function resolveRelevantSignals(
	signals: readonly SocialMediaSignal[],
	relevantIndices: readonly number[],
): SocialMediaSignal[] {
	const signalsByIndex = new Map(
		signals.map((signal) => [signal.index, signal]),
	);
	const seenIndices = new Set<number>();
	const relevantSignals: SocialMediaSignal[] = [];

	for (const index of relevantIndices) {
		if (seenIndices.has(index)) {
			continue;
		}

		const signal = signalsByIndex.get(index);
		if (signal) {
			relevantSignals.push(signal);
			seenIndices.add(index);
		}
	}

	return relevantSignals;
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
			`Social media relevance filter skipped (0 posts) in ${Date.now() - start}ms`,
		);
		return {
			relevantSignals: [],
			scannedCount: 0,
			durationMs: Date.now() - start,
		};
	}

	const batches = splitSocialMediaSignalsIntoBatches(signals, batchSize);
	const batchCount = batches.length;
	const chatOptions = {
		...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
	};

	console.info(
		`Social media: relevance filter — ${batchCount} batches × ${batchSize} posts (sequential)`,
	);

	const allRelevantIndices: number[] = [];

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

		allRelevantIndices.push(...relevantIndices);
		console.info(
			`Social media relevance ${batchLabel} — ${relevantIndices.length} relevant of ${batchSignals.length}`,
			`${(Date.now() - batchStart).toLocaleString()}ms`,
		);
	}

	const relevantSignals = resolveRelevantSignals(signals, allRelevantIndices);
	const durationMs = Date.now() - start;

	console.info(
		`Social media: relevance filter done — ${relevantSignals.length} relevant of ${signals.length} scanned in ${durationMs}ms`,
	);

	return {
		relevantSignals,
		scannedCount: signals.length,
		durationMs,
	};
}
