import { anthropicProvider } from "@/llm/providers/anthropicProvider.js";
import { openAiCompatibleProvider } from "@/llm/providers/openaiCompatibleProvider.js";
import type { LlmProvider, LlmRequestContext } from "@/llm/providers/types.js";
import type { LlmProviderId } from "@/schemas/LlmProvider.js";

const providers: Record<LlmProviderId, LlmProvider> = {
	openai_compatible: openAiCompatibleProvider,
	anthropic: anthropicProvider,
};

export function getLlmProvider(providerId: LlmProviderId): LlmProvider {
	return providers[providerId];
}

export async function completeJsonChatViaProvider(
	providerId: LlmProviderId,
	context: LlmRequestContext,
	prompt: string,
): Promise<string> {
	return getLlmProvider(providerId).completeJsonChat(context, prompt);
}
