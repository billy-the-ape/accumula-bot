import z from "zod";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";

export const SocialMediaRelevanceBatchSchema = z.object({
	relevant_post_indices: z.array(z.number().int().nonnegative()),
});

export const SocialMediaRelevanceBatchLlmSchema = z.object({
	relevant_post_indices: z.array(z.number().int().nonnegative()),
});

export type SocialMediaRelevanceBatch = z.infer<
	typeof SocialMediaRelevanceBatchSchema
>;
export type SocialMediaRelevanceBatchLlm = z.infer<
	typeof SocialMediaRelevanceBatchLlmSchema
>;

export type SocialMediaRelevanceBatchValidation = {
	promptSignals: readonly Pick<SocialMediaSignal, "index">[];
};

export function createSocialMediaRelevanceBatchValidation(
	promptSignals: readonly Pick<SocialMediaSignal, "index">[],
): SocialMediaRelevanceBatchValidation {
	return { promptSignals };
}

export function createSocialMediaRelevanceBatchLlmSchema(
	validation: SocialMediaRelevanceBatchValidation,
) {
	const allowedPostIndices = new Set(
		validation.promptSignals.map((signal) => signal.index),
	);

	return SocialMediaRelevanceBatchLlmSchema.superRefine((data, ctx) => {
		const seenIndices = new Set<number>();

		for (const [
			arrayIndex,
			postIndex,
		] of data.relevant_post_indices.entries()) {
			if (!allowedPostIndices.has(postIndex)) {
				ctx.addIssue({
					code: "custom",
					path: ["relevant_post_indices", arrayIndex],
					message: `Unknown post_index: ${postIndex}`,
				});
			}

			if (seenIndices.has(postIndex)) {
				ctx.addIssue({
					code: "custom",
					path: ["relevant_post_indices", arrayIndex],
					message: `Duplicate post_index: ${postIndex}`,
				});
			}

			seenIndices.add(postIndex);
		}
	});
}
