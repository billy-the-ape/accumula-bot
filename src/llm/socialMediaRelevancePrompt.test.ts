import { describe, expect, it } from "vitest";
import { UNTRUSTED_BEGIN_MARKER } from "@/analysis/trustBoundary.js";
import { buildSocialMediaRelevancePromptParts } from "@/llm/socialMediaRelevancePrompt.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";

const sampleSignal = (
	overrides: Partial<SocialMediaSignal> = {},
): SocialMediaSignal => ({
	index: 0,
	id: "1234567890",
	source: "twitter",
	username: "whale_alert",
	text: "Large BTC transfer detected",
	asOf: "2026-06-16T12:00:00.000Z",
	impressions: 42_000,
	...overrides,
});

describe("buildSocialMediaRelevancePromptParts", () => {
	it("puts JSON contract rules for relevant_post_indices in the system prompt", () => {
		const prompt = buildSocialMediaRelevancePromptParts({
			batchSignals: [sampleSignal()],
			batchNumber: 1,
			batchCount: 3,
			outlookAssets: ["BTC", "ETH"],
		});

		expect(prompt.system).toContain("parseable by JSON.parse()");
		expect(prompt.system).toContain('"relevant_post_indices"');
		expect(prompt.system).not.toContain("top_posts");
		expect(prompt.system).not.toContain("relevant_count");
		expect(prompt.system).toContain("Valid example when one post qualifies");
		expect(prompt.system).toContain("Valid example when nothing qualifies");
	});

	it("asks for post_index filtering with relevance guidance in the user prompt", () => {
		const prompt = buildSocialMediaRelevancePromptParts({
			batchSignals: [sampleSignal({ index: 5 })],
			batchNumber: 2,
			batchCount: 5,
			outlookAssets: ["BTC"],
		});

		expect(prompt.user).toContain("Relevance bar (24-hour trading horizon):");
		expect(prompt.user).toContain("When in doubt, exclude");
		expect(prompt.user).toContain("Batch 2 of 5");
		expect(prompt.user).toContain("Posts in this batch: 1");
		expect(prompt.user).toContain("Outlook assets: BTC");
		expect(prompt.user).toContain("Valid post indices");
		expect(prompt.user).toContain("5");
		expect(prompt.user).not.toContain("top_posts");
	});

	it("wraps posts in a trust boundary with post indices", () => {
		const prompt = buildSocialMediaRelevancePromptParts({
			batchSignals: [sampleSignal()],
			batchNumber: 1,
			batchCount: 1,
			outlookAssets: ["BTC"],
		});

		expect(prompt.user).toContain(UNTRUSTED_BEGIN_MARKER);
		expect(prompt.user).toContain("[index=0]");
		expect(prompt.user).toContain("Large BTC transfer detected");
	});

	it("includes a macro briefing preamble before relevance guidance when marketContext is provided", () => {
		const generatedAt = new Date("2026-06-16T07:00:00.000Z");
		const prompt = buildSocialMediaRelevancePromptParts({
			batchSignals: [sampleSignal()],
			batchNumber: 1,
			batchCount: 1,
			outlookAssets: ["BTC"],
			marketContext: {
				content: "Risk-off ahead of CPI.",
				generatedAt,
			},
		});

		const relevanceIndex = prompt.user.indexOf(
			"Relevance bar (24-hour trading horizon):",
		);
		const preambleIndex = prompt.user.indexOf(
			"Market context (desk briefing generated 2026-06-16T07:00:00.000Z;):",
		);

		expect(preambleIndex).toBeGreaterThan(-1);
		expect(relevanceIndex).toBeGreaterThan(preambleIndex);
		expect(prompt.user).toContain("Risk-off ahead of CPI.");
	});

	it("omits the macro briefing preamble when marketContext is absent", () => {
		const prompt = buildSocialMediaRelevancePromptParts({
			batchSignals: [sampleSignal()],
			batchNumber: 1,
			batchCount: 1,
			outlookAssets: ["BTC"],
		});

		expect(prompt.user).not.toContain(
			"Market context (desk briefing generated",
		);
	});

	it("strips markdown citation links from macro briefing market context", () => {
		const prompt = buildSocialMediaRelevancePromptParts({
			batchSignals: [sampleSignal()],
			batchNumber: 1,
			batchCount: 1,
			outlookAssets: ["BTC"],
			marketContext: {
				content:
					"Hot CPI ([Reuters](https://reuters.com/a)). See [Fed](https://fed.gov) tone.",
				generatedAt: new Date("2026-06-16T07:00:00.000Z"),
			},
		});

		expect(prompt.user).toContain("Hot CPI. See Fed tone.");
		expect(prompt.user).not.toContain("https://");
	});
});
