import { describe, expect, it } from "vitest";
import {
	createSocialMediaRelevanceBatchLlmSchema,
	createSocialMediaRelevanceBatchValidation,
	SocialMediaRelevanceBatchSchema,
} from "@/schemas/SocialMediaRelevanceBatch.js";

const batchSignals = [{ index: 10 }, { index: 11 }, { index: 12 }] as const;

const validation = createSocialMediaRelevanceBatchValidation(batchSignals);

describe("createSocialMediaRelevanceBatchLlmSchema", () => {
	it("accepts an empty relevant_post_ids array", () => {
		const schema = createSocialMediaRelevanceBatchLlmSchema(validation);
		const result = schema.safeParse({ relevant_post_ids: [] });

		expect(result.success).toBe(true);
	});

	it("accepts valid indices from the batch", () => {
		const schema = createSocialMediaRelevanceBatchLlmSchema(validation);
		const result = schema.safeParse({ relevant_post_ids: [10, 12] });

		expect(result.success).toBe(true);
	});

	it("rejects unknown post_id values", () => {
		const schema = createSocialMediaRelevanceBatchLlmSchema(validation);
		const result = schema.safeParse({ relevant_post_ids: [10, 99] });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual(["relevant_post_ids", 1]);
		}
	});

	it("rejects duplicate indices in the response", () => {
		const schema = createSocialMediaRelevanceBatchLlmSchema(validation);
		const result = schema.safeParse({ relevant_post_ids: [10, 10] });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toContain("Duplicate");
		}
	});

	it("rejects negative indices", () => {
		const schema = createSocialMediaRelevanceBatchLlmSchema(validation);
		const result = schema.safeParse({ relevant_post_ids: [-1] });

		expect(result.success).toBe(false);
	});
});

describe("SocialMediaRelevanceBatchSchema", () => {
	it("parses a valid batch result", () => {
		const result = SocialMediaRelevanceBatchSchema.safeParse({
			relevant_post_ids: [10, 11],
		});

		expect(result.success).toBe(true);
	});
});
