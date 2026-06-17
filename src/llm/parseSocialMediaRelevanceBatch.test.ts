import { describe, expect, it } from "vitest";
import { ParseResponseError } from "@/llm/parseResponse.js";
import { parseSocialMediaRelevanceBatchJson } from "@/llm/parseSocialMediaRelevanceBatch.js";
import { createSocialMediaRelevanceBatchValidation } from "@/schemas/SocialMediaRelevanceBatch.js";

const thinkOpenTag = ["<", "think", ">"].join("");
const thinkCloseTag = ["<", "/", "think", ">"].join("");

const validation = createSocialMediaRelevanceBatchValidation([
	{ index: 0 },
	{ index: 1 },
	{ index: 2 },
]);

describe("parseSocialMediaRelevanceBatchJson", () => {
	it("parses plain JSON with relevant indices", () => {
		const result = parseSocialMediaRelevanceBatchJson(
			JSON.stringify({ relevant_post_ids: [0, 2] }),
			validation,
		);

		expect(result.relevant_post_ids).toEqual([0, 2]);
	});

	it("parses an empty relevant_post_ids array", () => {
		const result = parseSocialMediaRelevanceBatchJson(
			JSON.stringify({ relevant_post_ids: [] }),
			validation,
		);

		expect(result.relevant_post_ids).toEqual([]);
	});

	it("parses JSON wrapped in markdown fences", () => {
		const result = parseSocialMediaRelevanceBatchJson(
			`\`\`\`json\n${JSON.stringify({ relevant_post_ids: [1] })}\n\`\`\``,
			validation,
		);

		expect(result.relevant_post_ids).toEqual([1]);
	});

	it("parses JSON after a thinking block", () => {
		const result = parseSocialMediaRelevanceBatchJson(
			`${thinkOpenTag}Scanning batch...${thinkCloseTag}\n${JSON.stringify({ relevant_post_ids: [0] })}`,
			validation,
		);

		expect(result.relevant_post_ids).toEqual([0]);
	});

	it("throws ParseResponseError for invalid JSON", () => {
		expect(() =>
			parseSocialMediaRelevanceBatchJson("not-json", validation),
		).toThrow(ParseResponseError);
	});

	it("throws ParseResponseError for unknown post_id", () => {
		expect(() =>
			parseSocialMediaRelevanceBatchJson(
				JSON.stringify({ relevant_post_ids: [0, 99] }),
				validation,
			),
		).toThrow(ParseResponseError);
	});

	it("throws ParseResponseError for duplicate indices", () => {
		expect(() =>
			parseSocialMediaRelevanceBatchJson(
				JSON.stringify({ relevant_post_ids: [1, 1] }),
				validation,
			),
		).toThrow(ParseResponseError);
	});
});
