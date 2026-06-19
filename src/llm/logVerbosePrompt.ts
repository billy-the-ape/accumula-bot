import type { LlmChatPrompt } from "@/llm/providers/types.js";

export type VerboseResponsesPrompt = {
	instructions: string;
	input: string;
};

export function logVerboseChatPrompt(
	label: string,
	prompt: LlmChatPrompt,
): void {
	console.info(
		[
			`LLM prompt [${label}]`,
			"--- system ---",
			prompt.system,
			"--- user ---",
			prompt.user,
		].join("\n"),
	);
}

export function logVerboseResponsesPrompt(
	label: string,
	prompt: VerboseResponsesPrompt,
): void {
	console.info(
		[
			`LLM prompt [${label}]`,
			"--- instructions ---",
			prompt.instructions,
			"--- input ---",
			prompt.input,
		].join("\n"),
	);
}

export function logVerboseChatResponse(label: string, response: string): void {
	console.info(
		[`LLM response [${label}]`, "--- response ---", response].join("\n"),
	);
}
