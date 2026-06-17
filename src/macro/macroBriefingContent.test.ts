import { describe, expect, it } from "vitest";
import {
	formatMacroBriefingContentForTelegram,
	stripMarkdownLinksForPrompt,
} from "@/macro/macroBriefingContent.js";

describe("stripMarkdownLinksForPrompt", () => {
	it("removes parenthesized markdown citations entirely", () => {
		expect(
			stripMarkdownLinksForPrompt(
				"Hot CPI ([Reuters](https://reuters.com/article)) today.",
			),
		).toBe("Hot CPI today.");
	});

	it("replaces bare markdown links with anchor text only", () => {
		expect(
			stripMarkdownLinksForPrompt(
				"See [Fed](https://www.federalreserve.gov) comments.",
			),
		).toBe("See Fed comments.");
	});

	it("handles multiple citations in one briefing", () => {
		expect(
			stripMarkdownLinksForPrompt(
				"Risk-off ([Bloomberg](https://bloomberg.com/a)) and ([CNBC](https://cnbc.com/b)).",
			),
		).toBe("Risk-off and.");
	});
});

describe("formatMacroBriefingContentForTelegram", () => {
	it("converts parenthesized markdown links to Telegram MarkdownV2 links", () => {
		expect(
			formatMacroBriefingContentForTelegram(
				"Hot CPI ([Reuters](https://reuters.com/article)) today.",
			),
		).toBe("Hot CPI \\([Reuters](https://reuters.com/article)\\) today\\.");
	});

	it("converts bare markdown links without surrounding parentheses", () => {
		expect(
			formatMacroBriefingContentForTelegram(
				"See [Fed](https://www.federalreserve.gov) comments.",
			),
		).toBe("See [Fed](https://www.federalreserve.gov) comments\\.");
	});

	it("escapes plain text special characters outside links", () => {
		expect(
			formatMacroBriefingContentForTelegram("BTC < $70k & risk-off."),
		).toBe("BTC < $70k & risk\\-off\\.");
	});
});
