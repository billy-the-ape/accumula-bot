import type { AnalysisContext } from "@/analysis/types.js";
import type { AppConfig } from "@/config/index.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";

export type AnalysisPromptParts = {
	system: string;
	user: string;
};

export function getAnalyzableAssets(config: AppConfig): Cryptocurrency[] {
	const assets = config.assetTradeable.filter((asset) => !asset.isStable);
	if (assets.length === 0) {
		throw new Error("No non-stable assets configured for analysis");
	}

	return assets;
}

function formatAnalysisSections(context: AnalysisContext): string {
	return context.sections
		.map((section) => [`${section.label}:`, section.promptText].join("\n"))
		.join("\n\n");
}

function buildExampleOutlooks(outlookAssets: readonly string[]): string {
	return JSON.stringify(
		{
			outlooks: outlookAssets.map((asset, index) => ({
				asset,
				direction_score: [8, 5, 4][index % 3] ?? 5,
				confidence: 0.72,
				reason: "One short sentence.",
			})),
			summary: "Optional one-line summary.",
		},
		null,
		2,
	);
}

function buildJsonOutputContract(outlookAssets: readonly string[]): string {
	const assetList = outlookAssets.join(", ");

	return [
		"You are a JSON API that returns machine-readable portfolio outlooks.",
		"",
		"Output contract:",
		"- Your entire response must be one JSON object parseable by JSON.parse().",
		'- The first character must be "{" and the last character must be "}".',
		"- Do not wrap the JSON in markdown fences.",
		"- Do not include prose, headings, explanations, or reasoning outside the JSON.",
		"- Do not include comments, trailing commas, or duplicate keys.",
		"- Use double quotes for all strings.",
		"- Use JSON numbers for direction_score and confidence, not numeric strings.",
		"",
		"Required top-level fields:",
		'- "outlooks": array with exactly one object per asset',
		'- "summary": optional string',
		"",
		"Required outlook object fields:",
		'- "asset": one of the requested symbols',
		'- "direction_score": integer from 1 to 10 representing your expectation of the price direction of the asset over the next 24 hours',
		'- "confidence": number from 0 to 1 representing the model\'s confidence in this outlook',
		'- "reason": short string explaining this outlook',
		"",
		"Forbidden field names:",
		'- Do not use "score", "rating", "probability", "reasoning", or "analysis".',
		"",
		`Required assets (include each exactly once): ${assetList}`,
		"",
		"Valid example for the requested assets:",
		buildExampleOutlooks(outlookAssets),
	].join("\n");
}

export function buildAnalysisPromptParts(
	config: AppConfig,
	context: AnalysisContext,
	outlookAssets: readonly string[],
): AnalysisPromptParts {
	const assetList = outlookAssets.join(", ");
	const accumulateSymbol = config.assetToAccumulate.symbol;

	const system = buildJsonOutputContract(outlookAssets);

	const user = [
		"You are a crypto portfolio analyst.",
		"",
		"Objective:",
		`Maximize ${accumulateSymbol}-denominated returns through selective per-asset positioning.`,
		"",
		"Task:",
		"For each volatile asset below, estimate how it will perform over the next 24 hours.",
		"Use direction_score from 1 to 10:",
		"- 1 = likely to go down the most",
		"- 5 = price likely remains stable",
		"- 10 = likely to go up the most",
		"",
		`Outlook assets: ${assetList}`,
		"",
		"Analysis inputs:",
		formatAnalysisSections(context),
		"",
		"Return only the JSON object described in the system instructions.",
	].join("\n");

	return { system, user };
}

const MAX_INVALID_RESPONSE_LOG_CHARS = 2_000;

export function buildRepairPromptParts(
	original: AnalysisPromptParts,
	parseError: string,
	invalidResponse: string,
): AnalysisPromptParts {
	const truncatedResponse = invalidResponse.slice(
		0,
		MAX_INVALID_RESPONSE_LOG_CHARS,
	);
	const truncatedSuffix =
		invalidResponse.length > MAX_INVALID_RESPONSE_LOG_CHARS ? "…" : "";

	return {
		system: original.system,
		user: [
			original.user,
			"",
			"Your previous response could not be parsed as valid JSON.",
			`Parse error: ${parseError}`,
			"",
			"Invalid response:",
			`${truncatedResponse}${truncatedSuffix}`,
			"",
			"Return ONLY a corrected JSON object that matches the system instructions.",
			"Do not include markdown fences, prose, or reasoning outside the JSON.",
		].join("\n"),
	};
}

/** @deprecated Prefer buildAnalysisPromptParts for provider system/user messages. */
export function buildAnalysisPrompt(
	config: AppConfig,
	context: AnalysisContext,
	outlookAssets: readonly string[],
): string {
	const { system, user } = buildAnalysisPromptParts(
		config,
		context,
		outlookAssets,
	);

	return [system, "", user].join("\n");
}
