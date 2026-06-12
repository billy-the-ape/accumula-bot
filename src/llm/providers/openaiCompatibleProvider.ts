import type { LlmProvider } from "@/llm/providers/types.js";
import { LlmError } from "@/llm/providers/types.js";

type ChatCompletionResponse = {
	choices?: Array<{
		message?: {
			content?: string | null;
		};
	}>;
	error?: {
		message?: string;
	};
};

export function resolveChatCompletionsUrl(baseUrl: string): URL {
	const trimmed = baseUrl.replace(/\/+$/, "");
	if (trimmed.endsWith("/chat/completions")) {
		return new URL(trimmed);
	}
	if (trimmed.endsWith("/v1")) {
		return new URL(`${trimmed}/chat/completions`);
	}
	return new URL(`${trimmed}/v1/chat/completions`);
}

export const openAiCompatibleProvider: LlmProvider = {
	id: "openai_compatible",

	async completeJsonChat(context, prompt) {
		const fetchImpl = context.fetchImpl ?? fetch;
		const url = resolveChatCompletionsUrl(context.baseUrl);

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (context.apiKey) {
			headers.Authorization = `Bearer ${context.apiKey}`;
		}

		let response: Response;
		try {
			response = await fetchImpl(url, {
				method: "POST",
				headers,
				body: JSON.stringify({
					model: context.model,
					messages: [{ role: "user", content: prompt }],
					stream: false,
					response_format: { type: "json_object" },
				}),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "unknown error";
			throw new LlmError(
				`Failed to reach LLM provider at ${url.origin}: ${message}`,
			);
		}

		if (!response.ok) {
			const body = await response.text();
			throw new LlmError(
				`LLM request failed (${response.status}): ${body || response.statusText}`,
			);
		}

		let payload: ChatCompletionResponse;
		try {
			payload = (await response.json()) as ChatCompletionResponse;
		} catch {
			throw new LlmError("LLM provider returned a non-JSON response body");
		}

		if (payload.error?.message) {
			throw new LlmError(payload.error.message);
		}

		const content = payload.choices?.[0]?.message?.content?.trim();
		if (!content) {
			throw new LlmError("LLM provider returned an empty response");
		}

		return content;
	},
};
