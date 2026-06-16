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
		expect(prompt.system).toContain("top_posts must use relevance=high only");
		expect(prompt.user).toContain("Be selective");
		expect(prompt.user).toContain("When in doubt, exclude");
		expect(prompt.system).not.toContain('"posts":');
		expect(prompt.system).toContain('"post_index": 0');
		expect(prompt.user).toContain("Outlook assets: BTC, ETH, SOL");
		expect(prompt.user).toContain("Posts retrieved (full batch): 1");
		expect(prompt.user).toContain("Valid post indices (use post_index exactly");
		expect(prompt.user).toContain("0");
	});

	it("wraps posts in a trust boundary with post indices", () => {
		const prompt = buildSocialMediaAnalysisPromptParts({
			promptSignals: [sampleSignal()],
			totalRetrieved: 1,
			outlookAssets: ["BTC"],
		});

		expect(prompt.user).toContain(UNTRUSTED_BEGIN_MARKER);
		expect(prompt.user).toContain("[index=0]");
		expect(prompt.user).toContain("Large BTC transfer detected");
	});
});
