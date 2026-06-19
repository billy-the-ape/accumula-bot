import z from "zod";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";

export const SocialMediaRelevanceScoreEntrySchema = z.object({
	post_index: z.number().int().nonnegative(),
	relevance_score: z.number().int().min(1).max(10),
});

export const SocialMediaRelevanceScoreLlmSchema = z.object({
	scores: z.array(SocialMediaRelevanceScoreEntrySchema),
});

export type SocialMediaRelevanceScoreEntry = z.infer<
	typeof SocialMediaRelevanceScoreEntrySchema
>;
export type SocialMediaRelevanceScoreLlm = z.infer<
	typeof SocialMediaRelevanceScoreLlmSchema
>;

export type SocialMediaRelevanceScoreValidation = {
	validPostIndices: ReadonlySet<number>;
	expectedCount: number;
};

export function createSocialMediaRelevanceScoreValidation(
	batchSignals: readonly SocialMediaSignal[],
): SocialMediaRelevanceScoreValidation {
	return {
		validPostIndices: new Set(batchSignals.map((signal) => signal.index)),
		expectedCount: batchSignals.length,
	};
}

export function createSocialMediaRelevanceScoreLlmSchema(
	validation: SocialMediaRelevanceScoreValidation,
) {
	return SocialMediaRelevanceScoreLlmSchema.superRefine((data, ctx) => {
		const seenIndices = new Set<number>();

		for (const [index, entry] of data.scores.entries()) {
			if (!validation.validPostIndices.has(entry.post_index)) {
				ctx.addIssue({
					code: "custom",
					path: ["scores", index, "post_index"],
					message: `Unknown post_index ${entry.post_index}`,
				});
			}

			if (seenIndices.has(entry.post_index)) {
				ctx.addIssue({
					code: "custom",
					path: ["scores", index, "post_index"],
					message: `Duplicate post_index ${entry.post_index}`,
				});
			}

			seenIndices.add(entry.post_index);
		}

		if (data.scores.length !== validation.expectedCount) {
			ctx.addIssue({
				code: "custom",
				path: ["scores"],
				message: `Expected ${validation.expectedCount} scores, got ${data.scores.length}`,
			});
		}
	});
}

export function formatAllowedPostIndexHint(
	batchSignals: readonly SocialMediaSignal[],
): string {
	const indices = batchSignals.map((signal) => signal.index);
	if (indices.length <= 12) {
		return indices.join(", ");
	}

	return `${indices.slice(0, 12).join(", ")}, … (${indices.length} total)`;
}
