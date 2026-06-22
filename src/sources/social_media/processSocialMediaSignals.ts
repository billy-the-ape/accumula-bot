import type { AppConfig } from "@/config/index.js";
import { scoreSocialMediaSignals } from "@/llm/scoreSocialMediaSignals.js";
import type { SocialMediaMarketContext } from "@/llm/socialMediaPromptShared.js";
import type { ScoredSocialMediaPost } from "@/schemas/ScoredSocialMediaPost.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { collectSocialMediaSignals } from "@/sources/social_media/collectSocialMediaSignals.js";
import {
	SOCIAL_MEDIA_FETCH_WINDOW_MS,
	SOCIAL_MEDIA_MIN_RELEVANCE_SCORE,
	SOCIAL_MEDIA_PROMPT_TOP_COUNT,
	SOCIAL_MEDIA_REPORT_TOP_COUNT,
	SOCIAL_MEDIA_RETENTION_MS,
} from "@/sources/social_media/socialMediaScoringConstants.js";
import type { AppDatabase } from "@/storage/db.js";
import {
	deleteSocialMediaPostsOlderThan,
	getScoredExternalIds,
	getTopScoredSocialMediaPosts,
} from "@/storage/repositories/socialMediaPostRepository.js";
import { formatDuration, HOUR_MS } from "@/utils.js";

export type SocialMediaScoringStats = {
	fetched: number;
	newlyScored: number;
	skippedAlreadyScored: number;
};

export type ProcessSocialMediaSignalsResult = {
	signals: SocialMediaSignal[];
	topPostsForPrompt: ScoredSocialMediaPost[];
	topPostsForReport: ScoredSocialMediaPost[];
	stats: SocialMediaScoringStats;
};

export type ProcessSocialMediaSignalsOptions = {
	fetchImpl?: typeof fetch;
	outlookAssets?: readonly string[];
	marketContext?: SocialMediaMarketContext;
	now?: Date;
};

function filterUnscoredSignals(
	signals: readonly SocialMediaSignal[],
	scoredExternalIds: ReadonlySet<string>,
): {
	unscored: SocialMediaSignal[];
	skippedAlreadyScored: number;
} {
	const unscored: SocialMediaSignal[] = [];
	let skippedAlreadyScored = 0;

	for (const signal of signals) {
		if (scoredExternalIds.has(signal.id)) {
			skippedAlreadyScored += 1;
			continue;
		}

		unscored.push(signal);
	}

	return { unscored, skippedAlreadyScored };
}

export async function processSocialMediaSignals(
	config: AppConfig,
	db: AppDatabase,
	options: ProcessSocialMediaSignalsOptions = {},
): Promise<ProcessSocialMediaSignalsResult> {
	const start = Date.now();
	const now = options.now ?? new Date();

	const signals = await collectSocialMediaSignals(config, {
		fetchWindowMs: SOCIAL_MEDIA_FETCH_WINDOW_MS,
	});

	const scoredExternalIds = await getScoredExternalIds(
		db,
		"twitter",
		signals.map((signal) => signal.id),
	);

	const { unscored, skippedAlreadyScored } = filterUnscoredSignals(
		signals,
		scoredExternalIds,
	);

	let newlyScored = 0;

	if (unscored.length > 0) {
		console.info(
			`Social media: scoring ${unscored.length} new posts (${
				skippedAlreadyScored
			}/${signals.length} already scored)`,
		);

		const scoredSignals = await scoreSocialMediaSignals(config, unscored, {
			...(options.outlookAssets
				? { outlookAssets: options.outlookAssets }
				: {}),
			...(options.marketContext
				? { marketContext: options.marketContext }
				: {}),
			...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
			db,
		});

		newlyScored = scoredSignals.length;
	} else {
		console.info(
			`Social media: no new posts to score (${signals.length} fetched, all already scored)`,
		);
	}

	const retentionCutoff = new Date(now.getTime() - SOCIAL_MEDIA_RETENTION_MS);
	const deletedCount = await deleteSocialMediaPostsOlderThan(
		db,
		retentionCutoff,
	);
	if (deletedCount > 0) {
		console.info(
			`Social media: pruned ${deletedCount} scored posts older than ${formatDuration(SOCIAL_MEDIA_RETENTION_MS)}`,
		);
	}

	const todayCutoff = new Date(now.getTime() - HOUR_MS);
	const topPostsForPrompt = await getTopScoredSocialMediaPosts(db, {
		since: todayCutoff,
		minScore: SOCIAL_MEDIA_MIN_RELEVANCE_SCORE,
		limit: SOCIAL_MEDIA_PROMPT_TOP_COUNT,
	});

	const reportSince = new Date(now.getTime() - HOUR_MS);
	const topPostsForReport = await getTopScoredSocialMediaPosts(db, {
		since: reportSince,
		minScore: SOCIAL_MEDIA_MIN_RELEVANCE_SCORE,
		limit: SOCIAL_MEDIA_REPORT_TOP_COUNT,
	});

	console.info(
		`Social media pipeline completed in ${formatDuration(Date.now() - start)} (fetched=${signals.length}, newly_scored=${newlyScored}, prompt_top=${topPostsForPrompt.length}, report_top=${topPostsForReport.length})`,
	);

	return {
		signals,
		topPostsForPrompt,
		topPostsForReport,
		stats: {
			fetched: signals.length,
			newlyScored,
			skippedAlreadyScored,
		},
	};
}
