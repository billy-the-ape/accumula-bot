import type { LlmConfig } from "@/config/appConfigSchema.js";
import { completeJsonChatViaProvider } from "@/llm/providers/registry.js";
import type {
	LlmChatPrompt,
	LlmRequestContext,
} from "@/llm/providers/types.js";

export {
	anthropicProvider,
	resolveAnthropicMessagesUrl,
} from "@/llm/providers/anthropicProvider.js";
export {
	openAiCompatibleProvider,
	resolveChatCompletionsUrl,
} from "@/llm/providers/openaiCompatibleProvider.js";
export {
	completeJsonChatViaProvider,
	getLlmProvider,
} from "@/llm/providers/registry.js";
export {
	type LlmChatPrompt,
	LlmError,
	type LlmProvider,
	type LlmRequestContext,
} from "@/llm/providers/types.js";

export type CompleteJsonChatOptions = {
	fetchImpl?: typeof fetch;
};

export async function completeJsonChat(
	config: LlmConfig,
	prompt: LlmChatPrompt,
	options: CompleteJsonChatOptions = {},
): Promise<string> {
	const context: LlmRequestContext = {
		baseUrl: config.baseUrl,
		model: config.model,
		requestTimeoutMs: config.requestTimeoutMs,
		temperature: config.temperature,
		...(config.apiKey ? { apiKey: config.apiKey } : {}),
		...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
	};

	return completeJsonChatViaProvider(config.provider, context, prompt);
}
