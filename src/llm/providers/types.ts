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
	apiKey?: string;
	fetchImpl?: typeof fetch;
};

export interface LlmProvider {
	readonly id: LlmProviderId;
	completeJsonChat(context: LlmRequestContext, prompt: string): Promise<string>;
}
