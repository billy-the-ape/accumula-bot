import z from "zod";
import { ScoredSocialMediaPostSchema } from "@/schemas/ScoredSocialMediaPost.js";

export const SocialMediaScoringStatsSchema = z.object({
	fetched: z.number().int().nonnegative(),
	newlyScored: z.number().int().nonnegative(),
	skippedAlreadyScored: z.number().int().nonnegative(),
});

export const SocialMediaSectionPayloadSchema = z.object({
	// signals: SocialMediaSignalListSchema,
	topPostsForPrompt: z.array(ScoredSocialMediaPostSchema).optional(),
	topPostsForReport: z.array(ScoredSocialMediaPostSchema).optional(),
	scoringStats: SocialMediaScoringStatsSchema.optional(),
});

export type SocialMediaSectionPayload = z.infer<
	typeof SocialMediaSectionPayloadSchema
>;
