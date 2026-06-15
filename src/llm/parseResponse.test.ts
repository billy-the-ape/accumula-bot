import { describe, expect, it } from "vitest";
import {
	extractJsonText,
	ParseResponseError,
	parseTradeRecommendationJson,
} from "@/llm/parseResponse.js";

const validPayload = {
	outlooks: [
		{
			asset: "BTC",
			direction_score: 8,
			confidence: 0.74,
			reason: "BTC currently exhibits the strongest near-term setup.",
		},
		{
			asset: "ETH",
			direction_score: 5,
			confidence: 0.6,
			reason: "ETH likely stays range-bound.",
		},
		{
			asset: "SOL",
			direction_score: 4,
			confidence: 0.55,
			reason: "SOL momentum is fading.",
		},
	],
	summary: "BTC leads on 24h momentum.",
};

const validation = {
	outlookAssets: ["BTC", "ETH", "SOL"],
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
				'Let me analyze...\n\n{"outlooks":[{"asset":"BTC","direction_score":7,"confidence":0.7}]}',
			),
		).toBe(
			'{"outlooks":[{"asset":"BTC","direction_score":7,"confidence":0.7}]}',
		);
	});

	it("strips qwen think tags before extracting JSON", () => {
		expect(
			extractJsonText(
				'` `\nReasoning here\n`\n{"outlooks":[{"asset":"BTC","direction_score":7,"confidence":0.7}]}',
			),
		).toBe(
			'{"outlooks":[{"asset":"BTC","direction_score":7,"confidence":0.7}]}',
		);
	});

	it("extracts the first balanced JSON object from mixed text", () => {
		expect(extractJsonText('Here is the result:\n{"a":1}\nThanks.')).toBe(
			'{"a":1}',
		);
	});
});

describe("parseTradeRecommendationJson", () => {
	it("parses and validates per-asset outlooks", () => {
		const result = parseTradeRecommendationJson(
			JSON.stringify(validPayload),
			validation,
		);

		expect(result.outlooks).toHaveLength(3);
		expect(result.outlooks[0]?.direction_score).toBe(8);
	});

	it("rejects stablecoins in outlooks", () => {
		expect(() =>
			parseTradeRecommendationJson(
				JSON.stringify({
					...validPayload,
					outlooks: [{ asset: "USDC", direction_score: 5, confidence: 0.5 }],
				}),
				validation,
			),
		).toThrow(ParseResponseError);
	});

	it("rejects missing outlook assets", () => {
		expect(() =>
			parseTradeRecommendationJson(
				JSON.stringify({
					outlooks: [{ asset: "BTC", direction_score: 7, confidence: 0.7 }],
				}),
				validation,
			),
		).toThrow(ParseResponseError);
	});

	it("normalizes object-shaped outlooks and missing optional fields", () => {
		const result = parseTradeRecommendationJson(
			JSON.stringify({
				outlooks: {
					BTC: 8,
					ETH: 5,
					SOL: 2,
				},
			}),
			validation,
		);

		expect(result.outlooks).toEqual([
			{ asset: "BTC", direction_score: 8, confidence: 0.5 },
			{ asset: "ETH", direction_score: 5, confidence: 0.5 },
			{ asset: "SOL", direction_score: 2, confidence: 0.5 },
		]);
	});

	it("clamps out-of-range direction scores and confidence", () => {
		const result = parseTradeRecommendationJson(
			JSON.stringify({
				outlooks: [
					{ asset: "BTC", direction_score: 12, confidence: 1.2 },
					{ asset: "ETH", direction_score: 0, confidence: 0.6 },
					{ asset: "SOL", direction_score: 6, confidence: 0.5 },
				],
			}),
			validation,
		);

		expect(result.outlooks.map((outlook) => outlook.direction_score)).toEqual([
			10, 1, 6,
		]);
		expect(result.outlooks[0]?.confidence).toBe(1);
	});

	it("accepts outlook alias and symbol-shaped entries", () => {
		const result = parseTradeRecommendationJson(
			JSON.stringify({
				forecasts: [
					{ symbol: "BTC", direction_score: 9, confidence: 0.8 },
					{ symbol: "ETH", direction_score: 4, confidence: 0.4 },
					{ symbol: "SOL", direction_score: 2, confidence: 0.7 },
				],
				reasoning: "BTC leads on momentum.",
			}),
			validation,
		);

		expect(result.outlooks).toEqual([
			{
				asset: "BTC",
				direction_score: 9,
				confidence: 0.8,
			},
			{
				asset: "ETH",
				direction_score: 4,
				confidence: 0.4,
			},
			{
				asset: "SOL",
				direction_score: 2,
				confidence: 0.7,
			},
		]);
		expect(result.summary).toBe("BTC leads on momentum.");
	});

	it("synthesizes neutral outlooks when the model omits them entirely", () => {
		const result = parseTradeRecommendationJson(
			JSON.stringify({
				summary: "Insufficient detail from model.",
			}),
			validation,
		);

		expect(result.outlooks).toEqual([
			{ asset: "BTC", direction_score: 5, confidence: 0.5 },
			{ asset: "ETH", direction_score: 5, confidence: 0.5 },
			{ asset: "SOL", direction_score: 5, confidence: 0.5 },
		]);
	});

	it("rejects invalid JSON", () => {
		expect(() => parseTradeRecommendationJson("not-json", validation)).toThrow(
			/not valid JSON/i,
		);
	});
});
