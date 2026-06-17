import { describe, expect, it } from "vitest";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import {
	buildMacroBriefingPromptParts,
	MACRO_BRIEFING_MAX_AGE_MS,
	MACRO_BRIEFING_MAX_WORDS,
	MACRO_BRIEFING_PROMPT_VERSION,
} from "@/macro/macroBriefingPrompt.js";

describe("macroBriefingPrompt constants", () => {
	it("exports expected version and limits", () => {
		expect(MACRO_BRIEFING_PROMPT_VERSION).toBe("v2");
		expect(MACRO_BRIEFING_MAX_WORDS).toBe(150);
		expect(MACRO_BRIEFING_MAX_AGE_MS).toBe(36 * 60 * 60 * 1000);
	});
});

describe("buildMacroBriefingPromptParts", () => {
	it("asks for a concise macro narrative with outlook assets and date", () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
		});
		const prompt = buildMacroBriefingPromptParts(config, {
			now: new Date("2026-06-16T12:00:00.000Z"),
		});

		expect(prompt.system).toContain("Use web search");
		expect(prompt.system).toContain("Do not say you lack live access");
		expect(prompt.user).toContain("Today's date (UTC): 2026-06-16");
		expect(prompt.user).toContain("Outlook assets: BTC, ETH, SOL");
		expect(prompt.user).toContain(
			`In ${MACRO_BRIEFING_MAX_WORDS} words or less, what is the current macro and narrative affecting BTC, ETH, SOL markets?`,
		);
		expect(prompt.user).toContain("Dominant macro themes");
		expect(prompt.user).toContain("Risk-on vs risk-off");
	});
});
