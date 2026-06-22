import type { AppConfig } from "@/config/index.js";
import { completeJsonChat } from "@/llm/llmClient.js";
import { ParseResponseError } from "@/llm/parseResponse.js";
import { parseSocialMediaRelevanceScoreJson } from "@/llm/parseSocialMediaRelevanceScore.js";
import { LlmError } from "@/llm/providers/types.js";
import type { SocialMediaMarketContext } from "@/llm/socialMediaPromptShared.js";
import {
	buildSocialMediaScoringPromptParts,
	buildSocialMediaScoringRepairPromptParts,
} from "@/llm/socialMediaScoringPrompt.js";
import { createSocialMediaRelevanceScoreValidation } from "@/schemas/SocialMediaRelevanceScore.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import {
	SOCIAL_MEDIA_MIN_RELEVANCE_SCORE,
	SOCIAL_MEDIA_SCORE_BATCH_SIZE,
} from "@/sources/social_media/socialMediaScoringConstants.js";
import type { AppDatabase } from "@/storage";
import { saveScoredSocialMediaPosts } from "@/storage/repositories/socialMediaPostRepository";
import { formatDuration } from "@/utils.js";

export type ScoreSocialMediaSignalsOptions = {
	fetchImpl?: typeof fetch;
	outlookAssets?: readonly string[];
	marketContext?: SocialMediaMarketContext;
	db?: AppDatabase;
};

export type ScoredSocialMediaSignal = {
	signal: SocialMediaSignal;
	relevanceScore: number;
};

function splitIntoBatches(
	signals: readonly SocialMediaSignal[],
	batchSize: number,
): SocialMediaSignal[][] {
	const batches: SocialMediaSignal[][] = [];
	for (let index = 0; index < signals.length; index += batchSize) {
		batches.push(signals.slice(index, index + batchSize));
	}
	return batches;
}

function isEmptyLlmResponseError(error: unknown): boolean {
	return (
		error instanceof LlmError &&
		error.message.toLowerCase().includes("empty response")
	);
}

async function completeJsonChatWithEmptyRetry(
	config: AppConfig["llm"],
	prompt: ReturnType<typeof buildSocialMediaScoringPromptParts>,
	chatOptions: {
		fast?: boolean;
		fetchImpl?: typeof fetch;
		verbosePromptLabel?: string;
	},
): Promise<string> {
	try {
		return await completeJsonChat(config, prompt, {
			fast: true,
			...chatOptions,
		});
	} catch (error) {
		if (!isEmptyLlmResponseError(error)) {
			throw error;
		}

		console.info(
			"Social media scoring: LLM returned an empty response; retrying once...",
		);

		return await completeJsonChat(config, prompt, {
			fast: true,
			...chatOptions,
		});
	}
}

async function scoreBatch(
	config: AppConfig,
	batchSignals: readonly SocialMediaSignal[],
	options: {
		outlookAssets: readonly string[];
		marketContext?: SocialMediaMarketContext;
		fetchImpl?: typeof fetch;
		batchNumber: number;
		batchCount: number;
		db?: AppDatabase | undefined;
	},
): Promise<ScoredSocialMediaSignal[]> {
	const validation = createSocialMediaRelevanceScoreValidation(batchSignals);
	const prompt = buildSocialMediaScoringPromptParts({
		batchSignals,
		outlookAssets: options.outlookAssets,
		...(options.marketContext ? { marketContext: options.marketContext } : {}),
		batchNumber: options.batchNumber,
		batchCount: options.batchCount,
	});

	const chatOptions = {
		...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
		...(config.verbosePromptLogs
			? {
					verbosePromptLogs: true,
					verbosePromptLabel: `social-media-scoring-${options.batchNumber}`,
				}
			: {}),
	};

	let rawResponse = await completeJsonChatWithEmptyRetry(
		config.llm,
		prompt,
		chatOptions,
	);

	let scores: ReturnType<typeof parseSocialMediaRelevanceScoreJson>;
	try {
		scores = parseSocialMediaRelevanceScoreJson(rawResponse, validation);
	} catch (error) {
		if (!(error instanceof ParseResponseError)) {
			throw error;
		}

		console.warn(
			`Social media scoring batch ${options.batchNumber}/${options.batchCount} parse failed; retrying with repair prompt`,
		);

		const repairPrompt = buildSocialMediaScoringRepairPromptParts(
			prompt,
			error.message,
			rawResponse,
			batchSignals,
		);

		rawResponse = await completeJsonChat(config.llm, repairPrompt, {
			...chatOptions,
			verbosePromptLabel: `social-media-scoring-${options.batchNumber}-repair`,
		});

		scores = parseSocialMediaRelevanceScoreJson(rawResponse, validation);
	}

	const signalsByIndex = new Map(
		batchSignals.map((signal) => [signal.index, signal]),
	);

	const scoredSignals = scores.map((entry) => {
		const signal = signalsByIndex.get(entry.post_index);
		if (!signal) {
			throw new ParseResponseError(
				`Score referenced unknown post_index ${entry.post_index}`,
			);
		}

		return {
			signal,
			relevanceScore: entry.relevance_score,
		};
	});
	const now = new Date();

	if (options.db) {
		await saveScoredSocialMediaPosts(
			options.db,
			scoredSignals.map(({ signal, relevanceScore }) => ({
				externalId: signal.id,
				source: signal.source,
				username: signal.username,
				text: signal.text,
				postedAt: new Date(signal.asOf),
				impressions: signal.impressions,
				relevanceScore,
				scoredAt: now,
				llm: {
					provider: config.llm.provider,
					model: config.llm.model,
				},
			})),
		);
	}

	return scoredSignals;
}

export async function scoreSocialMediaSignals(
	config: AppConfig,
	signals: readonly SocialMediaSignal[],
	options: ScoreSocialMediaSignalsOptions = {},
): Promise<ScoredSocialMediaSignal[]> {
	if (signals.length === 0) {
		return [];
	}

	const outlookAssets =
		options.outlookAssets ??
		config.assetTradeable
			.filter((asset) => !asset.isStable)
			.map((asset) => asset.symbol);

	const batches = splitIntoBatches(signals, SOCIAL_MEDIA_SCORE_BATCH_SIZE);
	const start = Date.now();
	const scored: ScoredSocialMediaSignal[] = [];

	console.info(
		`Social media scoring: ${batches.length} batch(es) × up to ${SOCIAL_MEDIA_SCORE_BATCH_SIZE} posts (sequential)`,
	);

	for (const [batchIndex, batchSignals] of batches.entries()) {
		const batchNumber = batchIndex + 1;
		const batchStart = Date.now();
		const batchScores = await scoreBatch(config, batchSignals, {
			outlookAssets,
			db: options.db,
			...(options.marketContext
				? { marketContext: options.marketContext }
				: {}),
			...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
			batchNumber,
			batchCount: batches.length,
		});

		scored.push(...batchScores);

		const highScores = batchScores.filter(
			(entry) => entry.relevanceScore >= SOCIAL_MEDIA_MIN_RELEVANCE_SCORE,
		).length;
		console.info(
			`Social media scoring batch ${batchNumber}/${batches.length} — ${highScores}/${batchScores.length} scored >=${SOCIAL_MEDIA_MIN_RELEVANCE_SCORE} in ${formatDuration(Date.now() - batchStart)}`,
		);
	}

	console.info(
		`Social media scoring completed in ${formatDuration(Date.now() - start)} (${scored.length} posts)`,
	);

	return scored;
}
