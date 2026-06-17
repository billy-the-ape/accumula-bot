import { isOpenAiOfficialApi } from "@/llm/providers/chatCompletionsUrl.js";
import type { ReasoningEffort } from "@/llm/providers/types.js";

/** gpt-5.x and o-series models only accept the default temperature on api.openai.com. */
export function isReasoningModel(model: string): boolean {
	const normalized = model.trim().toLowerCase();
	return normalized.startsWith("gpt-5") || /^o[0-9]/.test(normalized);
}

export function supportsCustomTemperature(model: string): boolean {
	return !isReasoningModel(model);
}

export function applyTemperature(
	body: Record<string, unknown>,
	baseUrl: string,
	model: string,
	temperature: number,
): void {
	if (isOpenAiOfficialApi(baseUrl) && !supportsCustomTemperature(model)) {
		return;
	}

	body.temperature = temperature;
}

export function applyReasoningEffort(
	body: Record<string, unknown>,
	baseUrl: string,
	model: string,
	reasoningEffort?: ReasoningEffort,
): void {
	if (
		reasoningEffort &&
		isOpenAiOfficialApi(baseUrl) &&
		isReasoningModel(model)
	) {
		body.reasoning_effort = reasoningEffort;
	}
}
