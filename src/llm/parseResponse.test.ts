import { describe, expect, it } from "vitest";
import {
	extractJsonText,
	ParseResponseError,
	parseTradeRecommendationJson,
} from "@/llm/parseResponse.js";

const validPayload = {
	rankings: [
		{ asset: "BTC", score: 0.82 },
		{ asset: "SOL", score: 0.77 },
	],
	recommended_asset: "BTC",
	confidence: 0.74,
	reason: "BTC currently exhibits the strongest relative performance.",
};

describe("extractJsonText", () => {
	it("returns plain JSON unchanged", () => {
		expect(extractJsonText('{"a":1}')).toBe('{"a":1}');
	});

	it("strips markdown fences", () => {
		expect(extractJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}');
	});
});

describe("parseTradeRecommendationJson", () => {
	it("parses and validates a recommendation", () => {
		const result = parseTradeRecommendationJson(JSON.stringify(validPayload), [
			"BTC",
			"SOL",
		]);

		expect(result.recommended_asset).toBe("BTC");
	});

	it("rejects unknown recommended assets", () => {
		expect(() =>
			parseTradeRecommendationJson(JSON.stringify(validPayload), ["SOL"]),
		).toThrow(ParseResponseError);
	});

	it("rejects invalid JSON", () => {
		expect(() =>
			parseTradeRecommendationJson("not-json", ["BTC", "SOL"]),
		).toThrow(/not valid JSON/i);
	});
});
