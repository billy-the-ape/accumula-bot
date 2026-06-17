import { resolveChatCompletionsUrl } from "@/llm/providers/chatCompletionsUrl.js";
import type { LlmChatPrompt, LlmProvider } from "@/llm/providers/types.js";
import { LlmError } from "@/llm/providers/types.js";
import {
	createFetchWithTimeout,
	formatFetchErrorMessage,
} from "@/llm/requestTimeout.js";

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

export const ollamaProvider: LlmProvider = {
	id: "ollama",

	async completeJsonChat(context, prompt: LlmChatPrompt) {
		const fetchImpl =
			context.fetchImpl ?? createFetchWithTimeout(context.requestTimeoutMs);
		const url = resolveChatCompletionsUrl(context.baseUrl);

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (context.apiKey) {
			headers.Authorization = `Bearer ${context.apiKey}`;
		}

		const requestBody: Record<string, unknown> = {
			model: context.model,
			messages: [
				{ role: "system", content: prompt.system },
				{ role: "user", content: prompt.user },
			],
			stream: false,
			temperature: context.temperature,
			max_tokens: context.maxOutputTokens,
			options: {
				num_ctx: context.contextTokens,
			},
		};

		if (context.jsonMode !== false) {
			requestBody.response_format = { type: "json_object" };
		}

		let response: Response;
		try {
			response = await fetchImpl(url, {
				method: "POST",
				headers,
				body: JSON.stringify(requestBody),
			});
		} catch (error) {
			throw new LlmError(
				`Failed to reach LLM provider at ${url.origin}: ${formatFetchErrorMessage(error)}`,
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
