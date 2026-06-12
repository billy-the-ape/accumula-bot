import type { LlmProvider } from "@/llm/providers/types.js";
import { LlmError } from "@/llm/providers/types.js";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;

type AnthropicMessageResponse = {
	content?: Array<{
		type?: string;
		text?: string;
	}>;
	error?: {
		type?: string;
		message?: string;
	};
};

export function resolveAnthropicMessagesUrl(baseUrl: string): URL {
	const trimmed = baseUrl.replace(/\/+$/, "");
	if (trimmed.endsWith("/messages")) {
		return new URL(trimmed);
	}
	if (trimmed.endsWith("/v1")) {
		return new URL(`${trimmed}/messages`);
	}
	return new URL(`${trimmed}/v1/messages`);
}

export const anthropicProvider: LlmProvider = {
	id: "anthropic",

	async completeJsonChat(context, prompt) {
		if (!context.apiKey) {
			throw new LlmError("Anthropic provider requires LLM_API_KEY");
		}

		const fetchImpl = context.fetchImpl ?? fetch;
		const url = resolveAnthropicMessagesUrl(context.baseUrl);

		let response: Response;
		try {
			response = await fetchImpl(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": context.apiKey,
					"anthropic-version": ANTHROPIC_VERSION,
				},
				body: JSON.stringify({
					model: context.model,
					max_tokens: DEFAULT_MAX_TOKENS,
					messages: [{ role: "user", content: prompt }],
				}),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "unknown error";
			throw new LlmError(
				`Failed to reach Anthropic at ${url.origin}: ${message}`,
			);
		}

		if (!response.ok) {
			const body = await response.text();
			throw new LlmError(
				`Anthropic request failed (${response.status}): ${body || response.statusText}`,
			);
		}

		let payload: AnthropicMessageResponse;
		try {
			payload = (await response.json()) as AnthropicMessageResponse;
		} catch {
			throw new LlmError("Anthropic returned a non-JSON response body");
		}

		if (payload.error?.message) {
			throw new LlmError(payload.error.message);
		}

		const content = payload.content
			?.filter((block) => block.type === "text")
			.map((block) => block.text ?? "")
			.join("")
			.trim();

		if (!content) {
			throw new LlmError("Anthropic returned an empty response");
		}

		return content;
	},
};
