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

	it("extracts JSON after a qwen-style thinking block", () => {
		expect(
			extractJsonText(
				'Let me analyze...\n\n{"recommended_asset":"BTC","confidence":0.7}',
			),
		).toBe('{"recommended_asset":"BTC","confidence":0.7}');
	});

	it("extracts the first balanced JSON object from mixed text", () => {
		expect(extractJsonText('Here is the result:\n{"a":1}\nThanks.')).toBe(
			'{"a":1}',
		);
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

	it("accepts ranking alias and symbol-shaped ranking entries", () => {
		const result = parseTradeRecommendationJson(
			JSON.stringify({
				ranking: [
					{ symbol: "BTC", score: 0.9 },
					{ symbol: "ETH", score: 0.4 },
					{ symbol: "SOL", score: 0.2 },
				],
				recommended_asset: "BTC",
				confidence: 0.8,
				reason: "BTC leads on momentum.",
			}),
			validation,
		);

		expect(result.rankings).toEqual([
			{ asset: "BTC", score: 0.9 },
			{ asset: "ETH", score: 0.4 },
			{ asset: "SOL", score: 0.2 },
		]);
	});

	it("synthesizes rankings when the model omits them entirely", () => {
		const result = parseTradeRecommendationJson(
			JSON.stringify({
				recommended_asset: "ETH",
				confidence: 0.72,
				reason: "ETH momentum is strongest.",
			}),
			validation,
		);

		expect(result.rankings).toEqual([
			{ asset: "BTC", score: 0.62 },
			{ asset: "ETH", score: 0.72 },
			{ asset: "SOL", score: 0.62 },
		]);
	});

	it("rejects invalid JSON", () => {
		expect(() => parseTradeRecommendationJson("not-json", validation)).toThrow(
			/not valid JSON/i,
		);
	});
});
