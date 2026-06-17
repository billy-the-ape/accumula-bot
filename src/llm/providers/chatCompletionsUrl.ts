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

/** OpenAI's hosted API uses max_completion_tokens on newer models (e.g. gpt-5.x). */
export function isOpenAiOfficialApi(baseUrl: string): boolean {
	try {
		return resolveChatCompletionsUrl(baseUrl).hostname === "api.openai.com";
	} catch {
		return baseUrl.toLowerCase().includes("api.openai.com");
	}
}
export function applyMaxOutputTokens(
	body: Record<string, unknown>,
	baseUrl: string,
	maxOutputTokens: number,
): void {
	if (isOpenAiOfficialApi(baseUrl)) {
		body.max_completion_tokens = maxOutputTokens;
		return;
	}

	body.max_tokens = maxOutputTokens;
}
