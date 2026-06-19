import type { LlmConfig } from "@/config/appConfigSchema.js";
import {
	logVerboseChatPrompt,
	logVerboseChatResponse,
} from "@/llm/logVerbosePrompt.js";
import { completeJsonChatViaProvider } from "@/llm/providers/registry.js";
import type {
	LlmChatPrompt,
	LlmRequestContext,
	ReasoningEffort,
} from "@/llm/providers/types.js";

export {
	anthropicProvider,
	resolveAnthropicMessagesUrl,
} from "@/llm/providers/anthropicProvider.js";
export { ollamaProvider } from "@/llm/providers/ollamaProvider.js";
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
	/** When false, omit JSON response_format (for prose outputs). Default: true. */
	jsonMode?: boolean;
	/** When true, omit max_tokens / max_completion_tokens from the request. */
	omitMaxOutputTokens?: boolean;
	reasoningEffort?: ReasoningEffort;
	fast?: boolean;
	verbosePromptLogs?: boolean;
	verbosePromptLabel?: string;
};

export async function completeJsonChat(
	config: LlmConfig,
	prompt: LlmChatPrompt,
	options: CompleteJsonChatOptions = {},
): Promise<string> {
	if (options.verbosePromptLogs) {
		logVerboseChatPrompt(options.verbosePromptLabel ?? "llm", prompt);
	}

	const context: LlmRequestContext = {
		baseUrl: config.baseUrl,
		model: options.fast ? config.fastModel : config.model,
		requestTimeoutMs: config.requestTimeoutMs,
		temperature: config.temperature,
		contextTokens: config.contextTokens,
		maxOutputTokens: config.maxOutputTokens,
		...(config.apiKey ? { apiKey: config.apiKey } : {}),
		...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
		...(options.jsonMode === false ? { jsonMode: false } : {}),
		...(options.omitMaxOutputTokens ? { omitMaxOutputTokens: true } : {}),
		...(options.reasoningEffort
			? { reasoningEffort: options.reasoningEffort }
			: {}),
	};

	const response = await completeJsonChatViaProvider(
		config.provider,
		context,
		prompt,
	);

	if (options.verbosePromptLogs) {
		logVerboseChatResponse(options.verbosePromptLabel ?? "llm", response);
	}

	return response;
}
