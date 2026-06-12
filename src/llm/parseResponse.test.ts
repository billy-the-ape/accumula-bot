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

const validation = {
	rankingAssets: ["BTC", "ETH", "SOL"],
	recommendedAssets: ["BTC", "ETH", "SOL", "USDC"],
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
	it("parses and validates a volatile rotation recommendation", () => {
		const result = parseTradeRecommendationJson(
			JSON.stringify(validPayload),
			validation,
		);

		expect(result.recommended_asset).toBe("BTC");
	});

	it("allows defensive cash as recommended_asset", () => {
		const result = parseTradeRecommendationJson(
			JSON.stringify({
				...validPayload,
				recommended_asset: "USDC",
				reason: "Preserve capital during broad weakness.",
			}),
			validation,
		);

		expect(result.recommended_asset).toBe("USDC");
	});

	it("rejects stablecoins in rankings", () => {
		expect(() =>
			parseTradeRecommendationJson(
				JSON.stringify({
					...validPayload,
					rankings: [{ asset: "USDC", score: 0.5 }],
				}),
				validation,
			),
		).toThrow(ParseResponseError);
	});

	it("rejects unknown recommended assets", () => {
		expect(() =>
			parseTradeRecommendationJson(JSON.stringify(validPayload), {
				...validation,
				recommendedAssets: ["SOL"],
			}),
		).toThrow(ParseResponseError);
	});

	it("rejects invalid JSON", () => {
		expect(() => parseTradeRecommendationJson("not-json", validation)).toThrow(
			/not valid JSON/i,
		);
	});
});
