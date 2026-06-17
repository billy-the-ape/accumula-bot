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
	it("puts JSON contract rules for relevant_post_ids in the system prompt", () => {
		const prompt = buildSocialMediaRelevancePromptParts({
			batchSignals: [sampleSignal()],

			batchNumber: 1,

			batchCount: 3,

			outlookAssets: ["BTC", "ETH"],
		});

		expect(prompt.system).toContain("parseable by JSON.parse()");

		expect(prompt.system).toContain('"relevant_post_ids"');

		expect(prompt.system).toContain("[post_id=N] label on that post");
		expect(prompt.system).toContain("Allowed post_id values for this batch:");
		expect(prompt.system).toContain("[0]");

		expect(prompt.system).not.toContain("top_posts");

		expect(prompt.system).not.toContain("relevant_count");

		expect(prompt.system).toContain("Valid example when post_id 0 qualifies");

		expect(prompt.system).toContain("Valid example when nothing qualifies");
	});

	it("uses a decision rule, asset aliases, and few-shot examples in the user prompt", () => {
		const prompt = buildSocialMediaRelevancePromptParts({
			batchSignals: [sampleSignal({ index: 5 })],

			batchNumber: 2,

			batchCount: 5,

			outlookAssets: ["BTC"],
		});

		expect(prompt.user).toContain("Decision rule (24-hour trading horizon):");

		expect(prompt.user).toContain("BTC (Bitcoin)");

		expect(prompt.user).toContain("Relevance examples (illustrative only");
		expect(prompt.user).toContain("do NOT copy any post_id numbers");
		expect(prompt.user).toContain("INCLUDE:");
		expect(prompt.user).toContain("EXCLUDE:");
		expect(prompt.user).toContain("(concrete exchange inflow)");
		expect(prompt.user).toContain("(price cheer, no new fact)");

		expect(prompt.user).toContain("Batch 2 of 5 — 1 post(s)");

		expect(prompt.user).not.toContain("Valid post ids");

		expect(prompt.user).toContain("Allowed post_id values:");
		expect(prompt.user).not.toContain("top_posts");
	});

	it("uses batch-local post_id labels even when global indices are sparse", () => {
		const prompt = buildSocialMediaRelevancePromptParts({
			batchSignals: [
				sampleSignal({ index: 47 }),
				sampleSignal({ index: 92, username: "DeItaone", text: "Fed update" }),
			],
			batchNumber: 1,
			batchCount: 1,
			outlookAssets: ["BTC"],
		});

		expect(prompt.user).toContain("[post_id=0] @whale_alert");
		expect(prompt.user).toContain("[post_id=1] @DeItaone");
		expect(prompt.user).not.toContain("[post_id=47]");
		expect(prompt.user).not.toContain("[post_id=92]");
		expect(prompt.user).toContain("Allowed post_id values: [0, 1]");
	});

	it("lists each post once inside the trust boundary with post_id labels", () => {
		const prompt = buildSocialMediaRelevancePromptParts({
			batchSignals: [sampleSignal()],

			batchNumber: 1,

			batchCount: 1,

			outlookAssets: ["BTC"],
		});

		expect(prompt.user).toContain(UNTRUSTED_BEGIN_MARKER);

		expect(prompt.user).toContain("[post_id=0] @whale_alert");

		expect(prompt.user).toContain("Large BTC transfer detected");

		expect(prompt.user).not.toContain("[post_id=0] @whale_alert:");

		expect((prompt.user.match(/\[post_id=0\]/g) ?? []).length).toBe(1);
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
			"Decision rule (24-hour trading horizon):",
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
