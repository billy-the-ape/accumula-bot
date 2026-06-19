import z from "zod";
import {
	formatSocialMediaPostId,
	type SocialMediaSignal,
} from "@/schemas/SocialMediaSignal";
import { summarizeSocialMediaSignal } from "@/sources/social_media/resolveSocialMediaSignal.js";
import { whyReferencesPostText } from "@/sources/social_media/validateSocialMediaTopPostWhy.js";

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
	/** Posts shown in the analysis prompt. LLM post_id must match signal.index. */
	promptSignals: readonly SocialMediaPromptSignal[];
	strict?: boolean;
};

function buildPromptSignalIndexMap(
	promptSignals: readonly SocialMediaPromptSignal[],
): Map<number, SocialMediaPromptSignal> {
	return new Map(promptSignals.map((signal) => [signal.index, signal]));
}

export function formatAllowedPostIdHint(
	promptSignals: readonly Pick<SocialMediaPromptSignal, "index">[],
): string {
	if (promptSignals.length === 0) {
		return "none (empty batch)";
	}

	const sortedIds = [...promptSignals.map((signal) => signal.index)].sort(
		(left, right) => left - right,
	);
	const minId = sortedIds[0]!;
	const maxId = sortedIds[sortedIds.length - 1]!;

	return `only integers N from [post_id=N] labels in the user prompt (this batch: ${minId}–${maxId})`;
}

export function createSocialMediaAnalysisValidation(
	allSignals: readonly Pick<SocialMediaSignal, "source" | "id" | "username">[],
	promptSignals: readonly SocialMediaPromptSignal[],
): SocialMediaAnalysisValidation {
	return {
		totalRetrieved: allSignals.length,
		promptSignals,
	};
}

export function createSocialMediaAnalysisLlmSchema(
	validation: SocialMediaAnalysisValidation,
) {
	const allowedPostIndices = new Set(
		validation.promptSignals.map((signal) => signal.index),
	);
	const postTextByIndex = new Map(
		validation.promptSignals.map((signal) => [signal.index, signal.text]),
	);
	const usernameByIndex = new Map(
		validation.promptSignals.map((signal) => [signal.index, signal.username]),
	);
	const maxTopPosts = validation.promptSignals.length;
	const allowedPostIdHint = formatAllowedPostIdHint(validation.promptSignals);

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

		const seenIndices = new Set<number>();
		const seenUsernames = new Set<string>();

		for (const [index, topPost] of data.top_posts.entries()) {
			if (!allowedPostIndices.has(topPost.post_id)) {
				ctx.addIssue({
					code: "custom",
					path: ["top_posts", index, "post_id"],
					message: `Unknown post_id: ${topPost.post_id} (valid: ${allowedPostIdHint})`,
				});
			}

			const username = usernameByIndex.get(topPost.post_id);
			if (username) {
				const normalizedUsername = username.toLowerCase();
				if (seenUsernames.has(normalizedUsername)) {
					ctx.addIssue({
						code: "custom",
						path: ["top_posts", index, "post_id"],
						message: `Only one top_posts entry allowed per username (@${username})`,
					});
				}
				seenUsernames.add(normalizedUsername);
			}

			const postText = postTextByIndex.get(topPost.post_id);
			if (postText && !whyReferencesPostText(topPost.why, postText)) {
				ctx.addIssue({
					code: "custom",
					path: ["top_posts", index, "why"],
					message:
						"why must cite a concrete fact, number, or phrase from that post's text",
				});
			}

			if (validation.strict) {
				if (seenIndices.has(topPost.post_id)) {
					ctx.addIssue({
						code: "custom",
						path: ["top_posts", index, "post_id"],
						message: `Duplicate top_posts post_id: ${topPost.post_id}`,
					});
				}

				seenIndices.add(topPost.post_id);
			}
		}
	});
}

export function remapSocialMediaAnalysisFromLlm(
	llm: SocialMediaAnalysisLlm,
	validation: SocialMediaAnalysisValidation,
): SocialMediaAnalysis {
	const signalByIndex = buildPromptSignalIndexMap(validation.promptSignals);

	const top_posts = llm.top_posts.map((topPost, topPostIndex) => {
		const signal = signalByIndex.get(topPost.post_id);
		if (!signal) {
			throw new Error(`Unknown post_id: ${topPost.post_id}`);
		}

		return {
			post_id: signal.index,
			id: formatSocialMediaPostId(signal),
			username: signal.username,
			rank: topPostIndex + 1,
			relevance: "high" as const,
			assets: topPost.assets,
			signal_type: topPost.signal_type,
			summary: summarizeSocialMediaSignal(signal),
			why: topPost.why,
		};
	});

	return SocialMediaAnalysisSchema.parse({
		total_retrieved: llm.total_retrieved,
		relevant_count: top_posts.length,
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
