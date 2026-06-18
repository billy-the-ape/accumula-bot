import { describe, expect, it } from "vitest";
import { UNTRUSTED_BEGIN_MARKER } from "@/analysis/trustBoundary.js";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import { getAnalyzableAssets } from "@/llm/prompt.js";
import { buildSocialMediaAnalysisPromptParts } from "@/llm/socialMediaPrompt.js";
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

describe("buildSocialMediaAnalysisPromptParts", () => {
	it("puts JSON contract rules in the system prompt", () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
		});
		const outlookAssets = getAnalyzableAssets(config).map(
			(asset) => asset.symbol,
		);
		const prompt = buildSocialMediaAnalysisPromptParts({
			promptSignals: [sampleSignal()],
			totalRetrieved: 1,
			outlookAssets,
		});

		expect(prompt.system).toContain("parseable by JSON.parse()");
		expect(prompt.system).toContain("relevant_count");
		expect(prompt.system).toContain('"high" or "medium"');
		expect(prompt.system).not.toContain('"posts":');
		expect(prompt.system).toContain('"post_id": 0');
		expect(prompt.user).toContain("Relevance rule (24-hour trading horizon):");
		expect(prompt.user).toContain("relevant_count=0 should be rare");
		expect(prompt.user).toContain("Set relevant_count");
		expect(prompt.user).toContain("Outlook assets: BTC, ETH, SOL");
		expect(prompt.user).toContain("Posts retrieved (full fetch): 1");
		expect(prompt.user).toContain("Posts shown: 1");
	});

	it("wraps posts in a trust boundary with post_id labels", () => {
		const prompt = buildSocialMediaAnalysisPromptParts({
			promptSignals: [sampleSignal()],
			totalRetrieved: 1,
			outlookAssets: ["BTC"],
		});

		expect(prompt.user).toContain(UNTRUSTED_BEGIN_MARKER);
		expect(prompt.user).toContain("[post_id=0]");
		expect(prompt.user).toContain("Large BTC transfer detected");
	});

	it("includes a macro briefing preamble before guidance when marketContext is provided", () => {
		const generatedAt = new Date("2026-06-16T07:00:00.000Z");
		const prompt = buildSocialMediaAnalysisPromptParts({
			promptSignals: [sampleSignal()],
			totalRetrieved: 1,
			outlookAssets: ["BTC"],
			marketContext: {
				content: "Risk-off ahead of CPI.",
				generatedAt,
			},
		});

		const guidanceIndex = prompt.user.indexOf("top_posts selection rules:");
		const preambleIndex = prompt.user.indexOf(
			"Market context (desk briefing generated 2026-06-16T07:00:00.000Z;):",
		);

		expect(preambleIndex).toBeGreaterThan(-1);
		expect(guidanceIndex).toBeGreaterThan(preambleIndex);
		expect(prompt.user).toContain("Risk-off ahead of CPI.");
		expect(prompt.user).toContain("posts are the primary evidence");
	});

	it("omits the macro briefing preamble when marketContext is absent", () => {
		const prompt = buildSocialMediaAnalysisPromptParts({
			promptSignals: [sampleSignal()],
			totalRetrieved: 1,
			outlookAssets: ["BTC"],
		});

		expect(prompt.user).not.toContain(
			"Market context (desk briefing generated",
		);
	});

	it("strips markdown citation links from macro briefing market context", () => {
		const prompt = buildSocialMediaAnalysisPromptParts({
			promptSignals: [sampleSignal()],
			totalRetrieved: 1,
			outlookAssets: ["BTC"],
			marketContext: {
				content:
					"Hot CPI ([Reuters](https://reuters.com/a)). See [Fed](https://fed.gov) tone.",
				generatedAt: new Date("2026-06-16T07:00:00.000Z"),
			},
		});

		expect(prompt.user).toContain("Hot CPI. See Fed tone.");
		expect(prompt.user).not.toContain("https://");
		expect(prompt.user).not.toContain("[Reuters]");
	});
});
