import type { AppConfig } from "@/config/index.js";
import { type AnalysisPromptParts, getAnalyzableAssets } from "@/llm/prompt.js";

export const MACRO_BRIEFING_PROMPT_VERSION = "v2";
export const MACRO_BRIEFING_MAX_WORDS = 150;
export const MACRO_BRIEFING_MAX_AGE_MS = 36 * 60 * 60 * 1000;

export type BuildMacroBriefingPromptOptions = {
	now?: Date;
};

export function buildMacroBriefingPromptParts(
	config: AppConfig,
	options: BuildMacroBriefingPromptOptions = {},
): AnalysisPromptParts {
	const now = options.now ?? new Date();
	const outlookAssets = getAnalyzableAssets(config).map(
		(asset) => asset.symbol,
	);
	const assetList = outlookAssets.join(", ");

	const system = [
		"You write concise market-context briefings for a crypto trading desk.",
		"Use web search to gather current macro and crypto-market information.",
		"Plain prose only. No JSON. No markdown fences.",
		`Maximum ${MACRO_BRIEFING_MAX_WORDS} words.`,
		"Ground the briefing in search results from the last 24-48 hours.",
		"Do not say you lack live access — search first, then summarize.",
		"If search results are thin on a point, say so briefly rather than inventing detail.",
	].join("\n");

	const user = [
		`Today's date (UTC): ${now.toISOString().slice(0, 10)}`,
		`Outlook assets: ${assetList}`,
		"",
		`In ${MACRO_BRIEFING_MAX_WORDS} words or less, what is the current macro and narrative affecting ${assetList} markets?`,
		"",
		"Cover:",
		"- Dominant macro themes from the last 24-48 hours",
		"- Key scheduled high-impact events ONLY within the next 24 hours",
		"- Risk-on vs risk-off read for crypto, with brief read-through to the outlook assets",
	].join("\n");

	return { system, user };
}

export function buildMacroBriefingResponsesRequest(
	config: AppConfig,
	options: BuildMacroBriefingPromptOptions = {},
): { instructions: string; input: string } {
	const parts = buildMacroBriefingPromptParts(config, options);
	return {
		instructions: parts.system,
		input: parts.user,
	};
}
