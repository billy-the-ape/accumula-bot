import z from "zod";
import {
	formatSocialMediaPostId,
	type SocialMediaSignal,
} from "@/schemas/SocialMediaSignal";
import { summarizeSocialMediaSignal } from "@/sources/social_media/resolveSocialMediaSignal.js";

export const SocialMediaAnalysisTopPostSchema = z.object({
	post_id: z.number().int().nonnegative(),
	id: z.string().min(1),
	username: z.string().min(1),
	rank: z.number().int().positive(),
	relevance: z.enum(["high", "medium"]),
	assets: z.array(z.string().min(1)),
	signal_type: z.string().min(1),
	summary: z.string().min(1),
	why: z.string().min(1),
});

export const SocialMediaAnalysisTopPostLlmSchema = z.object({
	post_id: z.number().int().nonnegative(),
	rank: z.number().int().positive(),
	relevance: z.enum(["high", "medium"]),
	assets: z.array(z.string().min(1)),
	signal_type: z.string().min(1),
	why: z.string().min(1),
});

export const SocialMediaAnalysisByAssetSchema = z.object({
	asset: z.string().min(1),
	sentiment: z.string().min(1),
	note: z.string().min(1),
});

export const MAX_SOCIAL_MEDIA_TOP_POSTS = 5;

export const SocialMediaAnalysisSchema = z.object({
	total_retrieved: z.number().int().nonnegative(),
	relevant_count: z.number().int().nonnegative(),
	summary: z.string().min(1),
	themes: z.array(z.string().min(1)),
	by_asset: z.array(SocialMediaAnalysisByAssetSchema),
	top_posts: z
		.array(SocialMediaAnalysisTopPostSchema)
		.max(MAX_SOCIAL_MEDIA_TOP_POSTS),
});

export const SocialMediaAnalysisLlmSchema = z.object({
	total_retrieved: z.number().int().nonnegative(),
	summary: z.string().min(1),
	themes: z.array(z.string().min(1)),
	by_asset: z.array(SocialMediaAnalysisByAssetSchema),
	top_posts: z
		.array(SocialMediaAnalysisTopPostLlmSchema)
		.max(MAX_SOCIAL_MEDIA_TOP_POSTS),
});

export type SocialMediaSentiment = string;
export type SocialMediaAnalysisTopPost = z.infer<
	typeof SocialMediaAnalysisTopPostSchema
>;
export type SocialMediaAnalysisTopPostLlm = z.infer<
	typeof SocialMediaAnalysisTopPostLlmSchema
>;
export type SocialMediaAnalysisByAsset = z.infer<
	typeof SocialMediaAnalysisByAssetSchema
>;
export type SocialMediaAnalysis = z.infer<typeof SocialMediaAnalysisSchema>;
export type SocialMediaAnalysisLlm = z.infer<
	typeof SocialMediaAnalysisLlmSchema
>;

export type SocialMediaPromptSignal = Pick<
	SocialMediaSignal,
	"source" | "id" | "username" | "index" | "text"
>;

export type SocialMediaAnalysisValidation = {
	/** Full number of posts retrieved from the source. */
	totalRetrieved: number;
	/** Posts actually shown in the Stage 1b synthesis prompt (pre-filtered relevant subset). */
	promptSignals: readonly SocialMediaPromptSignal[];
	/** Server-computed from Stage 1a relevance filter. */
	relevantCount: number;
	strict?: boolean;
};

export function createSocialMediaAnalysisValidation(
	allSignals: readonly Pick<SocialMediaSignal, "source" | "id" | "username">[],
	promptSignals: readonly SocialMediaPromptSignal[],
	relevantCount?: number,
): SocialMediaAnalysisValidation {
	return {
		totalRetrieved: allSignals.length,
		promptSignals,
		relevantCount: relevantCount ?? promptSignals.length,
	};
}

export function createSocialMediaAnalysisLlmSchema(
	validation: SocialMediaAnalysisValidation,
) {
	const allowedPostIndices = new Set(
		validation.promptSignals.map((signal) => signal.index),
	);
	const maxTopPosts = validation.promptSignals.length;

	return SocialMediaAnalysisLlmSchema.superRefine((data, ctx) => {
		if (data.total_retrieved !== validation.totalRetrieved) {
			ctx.addIssue({
				code: "custom",
				path: ["total_retrieved"],
				message: `total_retrieved must equal input post count (${validation.totalRetrieved})`,
			});
		}

		if (data.top_posts.length > maxTopPosts) {
			ctx.addIssue({
				code: "custom",
				path: ["top_posts"],
				message: `top_posts cannot exceed posts shown in prompt (${maxTopPosts})`,
			});
		}

		const seenRanks = new Set<number>();
		const seenIndices = new Set<number>();

		for (const [index, topPost] of data.top_posts.entries()) {
			if (topPost.relevance !== "high") {
				ctx.addIssue({
					code: "custom",
					path: ["top_posts", index, "relevance"],
					message: 'top_posts must use relevance "high" only',
				});
			}

			if (!allowedPostIndices.has(topPost.post_id)) {
				ctx.addIssue({
					code: "custom",
					path: ["top_posts", index, "post_id"],
					message: `Unknown post_id: ${topPost.post_id}`,
				});
			}

			if (validation.strict) {
				if (seenRanks.has(topPost.rank)) {
					ctx.addIssue({
						code: "custom",
						path: ["top_posts", index, "rank"],
						message: `Duplicate top_posts rank: ${topPost.rank}`,
					});
				}

				if (seenIndices.has(topPost.post_id)) {
					ctx.addIssue({
						code: "custom",
						path: ["top_posts", index, "post_id"],
						message: `Duplicate top_posts post_id: ${topPost.post_id}`,
					});
				}

				seenRanks.add(topPost.rank);
				seenIndices.add(topPost.post_id);
			}
		}
	});
}

export function remapSocialMediaAnalysisFromLlm(
	llm: SocialMediaAnalysisLlm,
	validation: SocialMediaAnalysisValidation,
): SocialMediaAnalysis {
	const signalsByIndex = new Map(
		validation.promptSignals.map((signal) => [signal.index, signal]),
	);

	const top_posts = llm.top_posts.map((topPost) => {
		const signal = signalsByIndex.get(topPost.post_id);
		if (!signal) {
			throw new Error(`Unknown post_id: ${topPost.post_id}`);
		}

		return {
			post_id: signal.index,
			id: formatSocialMediaPostId(signal),
			username: signal.username,
			rank: topPost.rank,
			relevance: topPost.relevance,
			assets: topPost.assets,
			signal_type: topPost.signal_type,
			summary: summarizeSocialMediaSignal(signal),
			why: topPost.why,
		};
	});

	return SocialMediaAnalysisSchema.parse({
		total_retrieved: llm.total_retrieved,
		relevant_count: validation.relevantCount,
		summary: llm.summary,
		themes: llm.themes,
		by_asset: llm.by_asset,
		top_posts,
	});
}

/** @deprecated Use createSocialMediaAnalysisLlmSchema for LLM output validation. */
export function createSocialMediaAnalysisSchema(
	validation: SocialMediaAnalysisValidation,
) {
	const allowedPostIds = new Set(
		validation.promptSignals.map(formatSocialMediaPostId),
	);
	const usernamesByPostId = new Map(
		validation.promptSignals.map((signal) => [
			formatSocialMediaPostId(signal),
			signal.username,
		]),
	);
	const maxRelevantAmongShown = validation.promptSignals.length;

	return SocialMediaAnalysisSchema.superRefine((data, ctx) => {
		if (data.total_retrieved !== validation.totalRetrieved) {
			ctx.addIssue({
				code: "custom",
				path: ["total_retrieved"],
				message: `total_retrieved must equal input post count (${validation.totalRetrieved})`,
			});
		}

		if (data.relevant_count > data.total_retrieved) {
			ctx.addIssue({
				code: "custom",
				path: ["relevant_count"],
				message: "relevant_count cannot exceed total_retrieved",
			});
		}

		if (data.relevant_count > maxRelevantAmongShown) {
			ctx.addIssue({
				code: "custom",
				path: ["relevant_count"],
				message: `relevant_count cannot exceed posts shown in prompt (${maxRelevantAmongShown})`,
			});
		}

		if (data.relevant_count < data.top_posts.length) {
			ctx.addIssue({
				code: "custom",
				path: ["relevant_count"],
				message:
					"relevant_count must be at least top_posts.length (top posts are relevant)",
			});
		}

		const seenRanks = new Set<number>();
		const seenIds = new Set<string>();

		for (const [index, topPost] of data.top_posts.entries()) {
			if (!allowedPostIds.has(topPost.id)) {
				ctx.addIssue({
					code: "custom",
					path: ["top_posts", index, "id"],
					message: `Unknown post id: ${topPost.id}`,
				});
			}

			if (validation.strict) {
				const expectedUsername = usernamesByPostId.get(topPost.id);
				if (expectedUsername && topPost.username !== expectedUsername) {
					ctx.addIssue({
						code: "custom",
						path: ["top_posts", index, "username"],
						message: `Username must match input for ${topPost.id}: expected @${expectedUsername}`,
					});
				}

				if (seenRanks.has(topPost.rank)) {
					ctx.addIssue({
						code: "custom",
						path: ["top_posts", index, "rank"],
						message: `Duplicate top_posts rank: ${topPost.rank}`,
					});
				}

				if (seenIds.has(topPost.id)) {
					ctx.addIssue({
						code: "custom",
						path: ["top_posts", index, "id"],
						message: `Duplicate top_posts id: ${topPost.id}`,
					});
				}

				seenRanks.add(topPost.rank);
				seenIds.add(topPost.id);
			}
		}
	});
}
