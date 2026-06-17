import type { LlmConfig } from "@/config/appConfigSchema.js";
import { isOpenAiOfficialApi } from "@/llm/providers/chatCompletionsUrl.js";
import type { ReasoningEffort } from "@/llm/providers/types.js";
import { LlmError } from "@/llm/providers/types.js";
import {
	createFetchWithTimeout,
	formatFetchErrorMessage,
} from "@/llm/requestTimeout.js";

export type OpenAiResponsesRequest = {
	instructions: string;
	input: string;
	reasoningEffort?: ReasoningEffort;
};

export type OpenAiResponsesCallOptions = {
	fetchImpl?: typeof fetch;
};

type ResponsesContentPart = {
	type?: string;
	text?: string | null;
};

type ResponsesOutputItem = {
	type?: string;
	content?: ResponsesContentPart[];
};

export type OpenAiResponsesPayload = {
	output_text?: string | null;
	output?: ResponsesOutputItem[];
	error?: {
		message?: string;
	};
};

export function resolveResponsesUrl(baseUrl: string): URL {
	const trimmed = baseUrl.replace(/\/+$/, "");
	if (trimmed.endsWith("/responses")) {
		return new URL(trimmed);
	}
	if (trimmed.endsWith("/v1")) {
		return new URL(`${trimmed}/responses`);
	}
	return new URL(`${trimmed}/v1/responses`);
}

export function extractResponsesOutputText(
	payload: OpenAiResponsesPayload,
): string | undefined {
	const direct = payload.output_text?.trim();
	if (direct) {
		return direct;
	}

	const chunks: string[] = [];
	for (const item of payload.output ?? []) {
		if (item.type !== "message") {
			continue;
		}

		for (const part of item.content ?? []) {
			if (part.type === "output_text") {
				const text = part.text?.trim();
				if (text) {
					chunks.push(text);
				}
			}
		}
	}

	if (chunks.length === 0) {
		return undefined;
	}

	return chunks.join("\n\n").trim();
}

export function assertMacroBriefingWebSearchConfig(config: LlmConfig): void {
	if (config.provider !== "openai_compatible") {
		throw new LlmError(
			"Macro briefing web search requires LLM_PROVIDER=openai_compatible",
		);
	}

	if (!config.apiKey) {
		throw new LlmError("Macro briefing web search requires LLM_API_KEY");
	}

	if (!isOpenAiOfficialApi(config.baseUrl)) {
		throw new LlmError(
			"Macro briefing web search requires LLM_BASE_URL=https://api.openai.com/v1",
		);
	}
}

export async function createOpenAiWebSearchResponse(
	config: LlmConfig,
	request: OpenAiResponsesRequest,
	options: OpenAiResponsesCallOptions = {},
): Promise<{ text: string; rawPayload: OpenAiResponsesPayload }> {
	assertMacroBriefingWebSearchConfig(config);

	const fetchImpl =
		options.fetchImpl ?? createFetchWithTimeout(config.requestTimeoutMs);
	const url = resolveResponsesUrl(config.baseUrl);
	const reasoningEffort = request.reasoningEffort ?? "high";

	const body = {
		model: config.model,
		instructions: request.instructions,
		input: request.input,
		reasoning: { effort: reasoningEffort },
		tools: [
			{
				type: "web_search",
				search_context_size: "medium",
			},
		],
		tool_choice: "required",
	};

	let response: Response;
	try {
		response = await fetchImpl(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${config.apiKey}`,
			},
			body: JSON.stringify(body),
		});
	} catch (error) {
		throw new LlmError(
			`Failed to reach OpenAI Responses API at ${url.origin}: ${formatFetchErrorMessage(error)}`,
		);
	}

	if (!response.ok) {
		const errorBody = await response.text();
		throw new LlmError(
			`OpenAI Responses API request failed (${response.status}): ${errorBody || response.statusText}`,
		);
	}

	let payload: OpenAiResponsesPayload;
	try {
		payload = (await response.json()) as OpenAiResponsesPayload;
	} catch {
		throw new LlmError(
			"OpenAI Responses API returned a non-JSON response body",
		);
	}

	if (payload.error?.message) {
		throw new LlmError(payload.error.message);
	}

	const text = extractResponsesOutputText(payload);
	if (!text) {
		throw new LlmError("OpenAI Responses API returned an empty response");
	}

	return { text, rawPayload: payload };
}
