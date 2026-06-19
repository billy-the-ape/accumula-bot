import z from "zod";
import { SocialMediaSourceSchema } from "@/schemas/SocialMediaSignal.js";

export const ScoredSocialMediaPostSchema = z.object({
	externalId: z.string().min(1),
	source: SocialMediaSourceSchema,
	username: z.string().min(1),
	text: z.string().min(1),
	postedAt: z
		.string()
		.min(1)
		.refine((value) => !Number.isNaN(Date.parse(value)), {
			message: "postedAt must be a parseable date-time string",
		}),
	impressions: z.number().nonnegative(),
	relevanceScore: z.number().int().min(1).max(10),
	scoredAt: z
		.string()
		.min(1)
		.refine((value) => !Number.isNaN(Date.parse(value)), {
			message: "scoredAt must be a parseable date-time string",
		})
		.optional(),
});

export type ScoredSocialMediaPost = z.infer<typeof ScoredSocialMediaPostSchema>;
