import { describe, expect, it } from "vitest";
import { salvageRelevantPostIds } from "@/llm/salvageRelevantPostIds.js";
import { createSocialMediaRelevanceBatchValidation } from "@/schemas/SocialMediaRelevanceBatch.js";

const validation = createSocialMediaRelevanceBatchValidation([
	{ index: 0 },
	{ index: 1 },
	{ index: 2 },
]);

describe("salvageRelevantPostIds", () => {
	it("returns null when every post_id is valid", () => {
		const result = salvageRelevantPostIds(
			JSON.stringify({ relevant_post_ids: [0, 2] }),
			validation,
		);

		expect(result).toBeNull();
	});

	it("drops unknown post_id values and keeps valid ones", () => {
		const result = salvageRelevantPostIds(
			JSON.stringify({ relevant_post_ids: [0, 99, 2, 10] }),
			validation,
		);

		expect(result).toEqual([0, 2]);
	});

	it("returns an empty array when every post_id is invalid", () => {
		const result = salvageRelevantPostIds(
			JSON.stringify({ relevant_post_ids: [10, 11, 12] }),
			validation,
		);

		expect(result).toEqual([]);
	});

	it("returns null for non-JSON responses", () => {
		expect(salvageRelevantPostIds("not-json", validation)).toBeNull();
	});
});
