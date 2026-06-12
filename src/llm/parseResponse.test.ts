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

	it("normalizes object-shaped rankings and missing optional fields", () => {
		const result = parseTradeRecommendationJson(
			JSON.stringify({
				rankings: {
					BTC: 0.82,
					ETH: -0.1,
					SOL: -0.2,
				},
				recommended_asset: "BTC",
			}),
			validation,
		);

		expect(result.rankings).toEqual([
			{ asset: "BTC", score: 0.82 },
			{ asset: "ETH", score: 0 },
			{ asset: "SOL", score: 0 },
		]);
		expect(result.confidence).toBe(0.5);
		expect(result.reason).toBe("No reason provided by model.");
	});

	it("clamps out-of-range scores and confidence to 0-1", () => {
		const result = parseTradeRecommendationJson(
			JSON.stringify({
				...validPayload,
				rankings: [
					{ asset: "BTC", score: 0.9 },
					{ asset: "ETH", score: -0.2 },
					{ asset: "SOL", score: -0.5 },
				],
				confidence: 1.2,
			}),
			validation,
		);

		expect(result.rankings.map((ranking) => ranking.score)).toEqual([
			0.9, 0, 0,
		]);
		expect(result.confidence).toBe(1);
	});

	it("rejects invalid JSON", () => {
		expect(() => parseTradeRecommendationJson("not-json", validation)).toThrow(
			/not valid JSON/i,
		);
	});
});
