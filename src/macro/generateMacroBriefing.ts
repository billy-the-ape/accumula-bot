import type { AppConfig } from "@/config/index.js";
import { createOpenAiWebSearchResponse } from "@/llm/providers/openAiResponsesClient.js";
import { LlmError } from "@/llm/providers/types.js";
import {
	buildMacroBriefingResponsesRequest,
	MACRO_BRIEFING_PROMPT_VERSION,
} from "@/macro/macroBriefingPrompt.js";

export type GenerateMacroBriefingOptions = {
	fetchImpl?: typeof fetch;
	now?: Date;
};

export type GenerateMacroBriefingResult = {
	content: string;
	promptVersion: string;
	llm: {
		provider: string;
		model: string;
		rawResponse: string;
		attempt: "initial" | "retry";
	};
};

function normalizeBriefingContent(raw: string): string {
	return raw.trim();
}

function isEmptyResponseError(error: unknown): boolean {
	return (
		error instanceof LlmError &&
		error.message.toLowerCase().includes("empty response")
	);
}

export async function generateMacroBriefing(
	config: AppConfig,
	options: GenerateMacroBriefingOptions = {},
): Promise<GenerateMacroBriefingResult> {
	const start = Date.now();
	const request = buildMacroBriefingResponsesRequest(config, options);
	const fetchOptions = {
		...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
	};

	console.info(
		`Macro briefing: Running OpenAI Responses web search (provider=${config.llm.provider}, model=${config.llm.model}, reasoning=high)...`,
	);

	let text: string;
	let rawResponse: string;
	let attempt: GenerateMacroBriefingResult["llm"]["attempt"];

	try {
		const result = await createOpenAiWebSearchResponse(
			config.llm,
			{
				...request,
				reasoningEffort: "high",
			},
			fetchOptions,
		);
		text = result.text;
		rawResponse = result.text;
		attempt = "initial";
	} catch (error) {
		if (!isEmptyResponseError(error)) {
			throw error;
		}

		console.info(
			"Macro briefing: OpenAI Responses returned an empty response; retrying once...",
		);
		const result = await createOpenAiWebSearchResponse(
			config.llm,
			{
				...request,
				reasoningEffort: "high",
			},
			fetchOptions,
		);
		text = result.text;
		rawResponse = result.text;
		attempt = "retry";
	}

	const content = normalizeBriefingContent(rawResponse);
	if (!content) {
		throw new LlmError("Macro briefing returned empty content after trim");
	}

	console.info(
		`Macro briefing generated in ${Date.now() - start}ms (attempt=${attempt}, provider=${config.llm.provider}, model=${config.llm.model}, words≈${content.split(/\s+/).length})`,
	);

	return {
		content,
		promptVersion: MACRO_BRIEFING_PROMPT_VERSION,
		llm: {
			provider: config.llm.provider,
			model: config.llm.model,
			rawResponse: text,
			attempt,
		},
	};
}
