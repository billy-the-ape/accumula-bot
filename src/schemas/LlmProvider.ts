import z from "zod";

export const LlmProviderIdSchema = z.enum([
	"ollama",
	"openai_compatible",
	"anthropic",
]);

export type LlmProviderId = z.infer<typeof LlmProviderIdSchema>;

export const DEFAULT_LLM_PROVIDER: LlmProviderId = "ollama";
