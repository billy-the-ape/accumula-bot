import type { LlmProviderId } from "@/schemas/LlmProvider.js";

export class LlmError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LlmError";
	}
}

export type LlmRequestContext = {
	baseUrl: string;
	model: string;
	requestTimeoutMs: number;
	temperature: number;
	contextTokens: number;
	maxOutputTokens: number;
	apiKey?: string;
	fetchImpl?: typeof fetch;
	/** When false, omit JSON response_format (for prose outputs). Default: true. */
	jsonMode?: boolean;
	/** When true, omit max_tokens / max_completion_tokens from the request. */
	omitMaxOutputTokens?: boolean;
	/** OpenAI reasoning models only (gpt-5.x, o-series). */
	reasoningEffort?: ReasoningEffort;
};

export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

export type LlmChatPrompt = {
	system: string;
	user: string;
};

export interface LlmProvider {
	readonly id: LlmProviderId;
	completeJsonChat(
		context: LlmRequestContext,
		prompt: LlmChatPrompt,
	): Promise<string>;
}
