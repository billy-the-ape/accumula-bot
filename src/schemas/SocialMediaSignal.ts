import z from "zod";

export const SocialMediaSourceSchema = z.enum(["twitter"]);

export const SocialMediaSignalSchema = z.object({
	/** Stable index from the fetch batch (used for Stage 1 LLM cross-reference). */
	index: z.number().int().nonnegative(),
	id: z.string().min(1),
	source: SocialMediaSourceSchema,
	// asset: z.string().min(1).optional(), // used for general market news - not specific to any asset
	username: z.string().min(1),
	text: z.string().min(1),
	asOf: z
		.string()
		.min(1)
		.refine((value) => !Number.isNaN(Date.parse(value)), {
			message: "asOf must be a parseable date-time string",
		}),
	impressions: z.number().nonnegative(),
});

export const SocialMediaSignalListSchema = z.array(SocialMediaSignalSchema);

export type SocialMediaSource = z.infer<typeof SocialMediaSourceSchema>;
export type SocialMediaSignal = z.infer<typeof SocialMediaSignalSchema>;

/** Stable cross-source reference used in prompts, analysis JSON, and reports. */
export function formatSocialMediaPostId(
	signal: Pick<SocialMediaSignal, "source" | "id">,
): string {
	return `${signal.source}:${signal.id}`;
}
