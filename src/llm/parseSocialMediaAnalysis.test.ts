import { describe, expect, it } from "vitest";
import { ParseResponseError } from "@/llm/parseResponse.js";
import { parseSocialMediaAnalysisJson } from "@/llm/parseSocialMediaAnalysis.js";
import { createSocialMediaAnalysisValidation } from "@/schemas/SocialMediaAnalysis.js";

const thinkOpenTag = ["<", "think", ">"].join("");
const thinkCloseTag = ["<", "/", "think", ">"].join("");

const validation = createSocialMediaAnalysisValidation(
	[{ source: "twitter", id: "111", username: "whale_alert" }],
	[
		{
			source: "twitter",
			id: "111",
			username: "whale_alert",
			index: 0,
			text: "Large BTC moved to an exchange.",
		},
	],
);

const validLlmPayload = {
	total_retrieved: 1,
	relevant_count: 1,
	summary: "One actionable whale alert.",
	themes: ["whale flow"],
	by_asset: [
		{
			asset: "BTC",
			sentiment: "bearish",
			note: "Exchange inflow increases sell-pressure risk.",
		},
	],
	top_posts: [
		{
			post_index: 0,
			rank: 1,
			relevance: "high",
			assets: ["BTC"],
			signal_type: "whale_alert",
			why: "Direct near-term supply signal.",
		},
	],
};

describe("parseSocialMediaAnalysisJson", () => {
	it("parses plain JSON and remaps post_index to composite ids", () => {
		const result = parseSocialMediaAnalysisJson(
			JSON.stringify(validLlmPayload),
			validation,
		);

		expect(result.summary).toBe(validLlmPayload.summary);
		expect(result.top_posts[0]?.id).toBe("twitter:111");
		expect(result.top_posts[0]?.username).toBe("whale_alert");
		expect(result.top_posts[0]?.summary).toBe(
			"Large BTC moved to an exchange.",
		);
	});

	it("parses JSON wrapped in markdown fences", () => {
		const result = parseSocialMediaAnalysisJson(
			`\`\`\`json\n${JSON.stringify(validLlmPayload)}\n\`\`\``,
			validation,
		);

		expect(result.relevant_count).toBe(1);
	});

	it("parses JSON after a thinking block", () => {
		const result = parseSocialMediaAnalysisJson(
			`${thinkOpenTag}Reviewing posts...${thinkCloseTag}\n${JSON.stringify(validLlmPayload)}`,
			validation,
		);

		expect(result.top_posts[0]?.why).toBe(validLlmPayload.top_posts[0]?.why);
	});

	it("throws ParseResponseError for invalid JSON", () => {
		expect(() => parseSocialMediaAnalysisJson("not-json", validation)).toThrow(
			ParseResponseError,
		);
	});

	it("throws ParseResponseError when validation fails", () => {
		expect(() =>
			parseSocialMediaAnalysisJson(
				JSON.stringify({ ...validLlmPayload, total_retrieved: 99 }),
				validation,
			),
		).toThrow(ParseResponseError);
	});

	it("throws ParseResponseError for unknown post_index", () => {
		expect(() =>
			parseSocialMediaAnalysisJson(
				JSON.stringify({
					...validLlmPayload,
					top_posts: [{ ...validLlmPayload.top_posts[0], post_index: 99 }],
				}),
				validation,
			),
		).toThrow(ParseResponseError);
	});
});
