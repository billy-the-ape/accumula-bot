import { describe, expect, it } from "vitest";
import {
	createSocialMediaAnalysisLlmSchema,
	createSocialMediaAnalysisSchema,
	createSocialMediaAnalysisValidation,
	MAX_SOCIAL_MEDIA_TOP_POSTS,
	remapSocialMediaAnalysisFromLlm,
	SocialMediaAnalysisSchema,
} from "@/schemas/SocialMediaAnalysis";

const allSignals = [
	{
		source: "twitter",
		id: "111",
		username: "whale_alert",
		index: 0,
		text: "Large BTC moved to an exchange.",
	},
	{
		source: "twitter",
		id: "222",
		username: "macro_news",
		index: 1,
		text: "Fed speaker struck a cautious tone.",
	},
	{
		source: "twitter",
		id: "333",
		username: "other_user",
		index: 2,
		text: "Post outside prompt subset.",
	},
] as const;

const validation = createSocialMediaAnalysisValidation(allSignals, allSignals);

const validAnalysis = {
	total_retrieved: 3,
	relevant_count: 2,
	summary:
		"- Large BTC moved to an exchange.\n- Fed speaker struck a cautious tone.",
	themes: ["whale flow", "macro"],
	by_asset: [
		{
			asset: "BTC",
			sentiment: "mixed" as const,
			note: "Whale deposit offset by steady ETF inflows.",
		},
	],
	top_posts: [
		{
			post_id: 0,
			id: "twitter:111",
			username: "whale_alert",
			rank: 1,
			relevance: "high" as const,
			assets: ["BTC"],
			signal_type: "whale_alert",
			summary: "Large BTC moved to an exchange.",
			why: "Reports large BTC moved to an exchange.",
		},
		{
			post_id: 1,
			id: "twitter:222",
			username: "macro_news",
			rank: 2,
			relevance: "high" as const,
			assets: ["MARKET"],
			signal_type: "macro",
			summary: "Fed speaker struck a cautious tone.",
			why: "Fed speaker struck a cautious tone.",
		},
	],
};

const validLlmAnalysis = {
	total_retrieved: 3,
	summary: validAnalysis.summary,
	themes: validAnalysis.themes,
	by_asset: validAnalysis.by_asset,
	top_posts: [
		{
			post_id: 0,
			assets: ["BTC"],
			signal_type: "whale_alert",
			why: "Reports large BTC moved to an exchange.",
		},
		{
			post_id: 1,
			assets: ["MARKET"],
			signal_type: "macro",
			why: "Fed speaker struck a cautious tone.",
		},
	],
};

describe("SocialMediaAnalysisSchema", () => {
	it("parses a valid analysis payload", () => {
		expect(SocialMediaAnalysisSchema.parse(validAnalysis)).toEqual(
			validAnalysis,
		);
	});

	it("rejects more than the max top_posts", () => {
		const tooManyTopPosts = {
			...validAnalysis,
			top_posts: Array.from(
				{ length: MAX_SOCIAL_MEDIA_TOP_POSTS + 1 },
				(_, index) => ({
					post_id: 0,
					id: "twitter:111",
					username: "whale_alert",
					rank: index + 1,
					relevance: "high" as const,
					assets: ["BTC"],
					signal_type: "whale_alert",
					summary: "summary",
					why: "reason",
				}),
			),
		};

		expect(() => SocialMediaAnalysisSchema.parse(tooManyTopPosts)).toThrow();
	});
});

describe("createSocialMediaAnalysisLlmSchema", () => {
	it("accepts LLM output with post_id values from the prompt subset", () => {
		const result =
			createSocialMediaAnalysisLlmSchema(validation).safeParse(
				validLlmAnalysis,
			);

		expect(result.success).toBe(true);
	});

	it("rejects unknown post_id values", () => {
		const result = createSocialMediaAnalysisLlmSchema(validation).safeParse({
			...validLlmAnalysis,
			top_posts: [{ ...validLlmAnalysis.top_posts[0], post_id: 99 }],
		});

		expect(result.success).toBe(false);
	});

	it("rejects generic why text that does not reference the post", () => {
		const result = createSocialMediaAnalysisLlmSchema(validation).safeParse({
			...validLlmAnalysis,
			top_posts: [
				{
					...validLlmAnalysis.top_posts[0],
					why: "Trusted wire headline from a macro account.",
				},
			],
		});

		expect(result.success).toBe(false);
	});

	it("rejects more than one top_posts entry from the same username", () => {
		const sameUserValidation = createSocialMediaAnalysisValidation(allSignals, [
			allSignals[0],
			{ ...allSignals[0], index: 3, id: "444", text: "Another whale post." },
		]);
		const result = createSocialMediaAnalysisLlmSchema(
			sameUserValidation,
		).safeParse({
			...validLlmAnalysis,
			top_posts: [
				{
					post_id: 0,
					assets: ["BTC"],
					signal_type: "whale_alert",
					why: "Reports large BTC moved to an exchange.",
				},
				{
					post_id: 3,
					assets: ["BTC"],
					signal_type: "whale_alert",
					why: "Another whale post.",
				},
			],
		});

		expect(result.success).toBe(false);
	});

	it("looks up posts by stable signal index during remap", () => {
		const promptSignals = [
			{ ...allSignals[1], index: 99 },
			{ ...allSignals[0], index: 42 },
		];
		const localValidation = createSocialMediaAnalysisValidation(
			allSignals,
			promptSignals,
		);
		const parsed = createSocialMediaAnalysisLlmSchema(localValidation).parse({
			...validLlmAnalysis,
			top_posts: [
				{
					post_id: 42,
					assets: ["BTC"],
					signal_type: "whale_alert",
					why: "Reports large BTC moved to an exchange.",
				},
				{
					post_id: 99,
					assets: ["MARKET"],
					signal_type: "macro",
					why: "Fed speaker struck a cautious tone.",
				},
			],
		});

		const remapped = remapSocialMediaAnalysisFromLlm(parsed, localValidation);
		expect(remapped.top_posts.map((post) => post.post_id)).toEqual([42, 99]);
		expect(remapped.top_posts.map((post) => post.rank)).toEqual([1, 2]);
	});

	it("derives relevant_count from top_posts length during remap", () => {
		const parsed =
			createSocialMediaAnalysisLlmSchema(validation).parse(validLlmAnalysis);

		expect(
			remapSocialMediaAnalysisFromLlm(parsed, validation).relevant_count,
		).toBe(2);
	});

	it("rejects top_posts exceeding the prompt subset size", () => {
		const singlePostValidation = createSocialMediaAnalysisValidation(
			allSignals,
			[allSignals[0]],
		);
		const result =
			createSocialMediaAnalysisLlmSchema(singlePostValidation).safeParse(
				validLlmAnalysis,
			);

		expect(result.success).toBe(false);
	});

	it("remaps LLM output using source post text for summaries", () => {
		const parsed =
			createSocialMediaAnalysisLlmSchema(validation).parse(validLlmAnalysis);

		expect(remapSocialMediaAnalysisFromLlm(parsed, validation)).toEqual(
			validAnalysis,
		);
	});

	it("ignores hallucinated LLM summaries during remap", () => {
		const parsed = createSocialMediaAnalysisLlmSchema(validation).parse({
			...validLlmAnalysis,
			top_posts: [
				{
					...validLlmAnalysis.top_posts[0],
					why: "Large BTC moved to an exchange.",
				},
			],
		});

		expect(
			remapSocialMediaAnalysisFromLlm(parsed, validation).top_posts[0]?.summary,
		).toBe("Large BTC moved to an exchange.");
	});
});

describe("createSocialMediaAnalysisSchema", () => {
	it("accepts analysis when cross-field rules pass", () => {
		const result =
			createSocialMediaAnalysisSchema(validation).safeParse(validAnalysis);

		expect(result.success).toBe(true);
	});

	it("rejects total_retrieved mismatch", () => {
		const result = createSocialMediaAnalysisSchema(validation).safeParse({
			...validAnalysis,
			total_retrieved: 2,
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(
				result.error.issues.some(
					(issue) => issue.path[0] === "total_retrieved",
				),
			).toBe(true);
		}
	});

	it("rejects relevant_count below top_posts.length", () => {
		const result = createSocialMediaAnalysisSchema(validation).safeParse({
			...validAnalysis,
			relevant_count: 1,
		});

		expect(result.success).toBe(false);
	});

	it("rejects unknown post ids", () => {
		const result = createSocialMediaAnalysisSchema(validation).safeParse({
			...validAnalysis,
			relevant_count: 1,
			top_posts: [
				{
					...validAnalysis.top_posts[0],
					id: "twitter:missing",
				},
			],
		});

		expect(result.success).toBe(false);
	});

	it("accepts zero relevant posts when nothing mattered", () => {
		const result = createSocialMediaAnalysisSchema(validation).safeParse({
			...validAnalysis,
			relevant_count: 0,
			top_posts: [],
			summary: "No market-moving social signals in this batch.",
			themes: [],
			by_asset: [],
		});

		expect(result.success).toBe(true);
	});

	it("allows total_retrieved to exceed prompt subset size", () => {
		const subsetValidation = createSocialMediaAnalysisValidation(allSignals, [
			allSignals[0],
			allSignals[1],
		]);

		const result =
			createSocialMediaAnalysisSchema(subsetValidation).safeParse(
				validAnalysis,
			);

		expect(result.success).toBe(true);
	});

	it("rejects post ids outside the prompt subset", () => {
		const subsetValidation = createSocialMediaAnalysisValidation(allSignals, [
			allSignals[0],
			allSignals[1],
		]);

		const result = createSocialMediaAnalysisSchema(subsetValidation).safeParse({
			...validAnalysis,
			top_posts: [
				{
					post_id: 2,
					id: "twitter:333",
					username: "other_user",
					rank: 1,
					relevance: "medium" as const,
					assets: ["MARKET"],
					signal_type: "macro",
					summary: "Post outside prompt subset.",
					why: "Not in prompt subset.",
				},
			],
		});

		expect(result.success).toBe(false);
	});

	it("builds validation from full batch and prompt subset", () => {
		expect(
			createSocialMediaAnalysisValidation(
				[{ source: "twitter", id: "abc", username: "user_a" }],
				[
					{
						source: "twitter",
						id: "abc",
						username: "user_a",
						index: 5,
						text: "Example post text.",
					},
				],
			),
		).toEqual({
			totalRetrieved: 1,
			promptSignals: [
				{
					source: "twitter",
					id: "abc",
					username: "user_a",
					index: 5,
					text: "Example post text.",
				},
			],
		});
	});
});
