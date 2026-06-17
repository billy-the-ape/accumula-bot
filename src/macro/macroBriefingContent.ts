import {
	escapeMarkdownV2,
	markdownLink,
} from "@/notifications/telegram/escapeMarkdownV2.js";

const PAREN_WRAPPED_MARKDOWN_LINK = /\(\s*\[[^\]]+\]\([^)]+\)\s*\)/g;
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const TELEGRAM_SEGMENT = /(\(\s*\[[^\]]+\]\([^)]+\)\s*\)|\[[^\]]+\]\([^)]+\))/g;

function normalizePromptSpacing(text: string): string {
	return text
		.replace(/[ \t]{2,}/g, " ")
		.replace(/ ([,.;:!?])/g, "$1")
		.trim();
}

/** Remove parenthesized markdown citations and bare link URLs for LLM prompts. */
export function stripMarkdownLinksForPrompt(content: string): string {
	return normalizePromptSpacing(
		content
			.replace(PAREN_WRAPPED_MARKDOWN_LINK, "")
			.replace(MARKDOWN_LINK, "$1"),
	);
}

function formatTelegramSegment(segment: string): string {
	const parenWrapped = segment.match(/^\(\s*\[([^\]]+)\]\(([^)]+)\)\s*\)$/);
	if (parenWrapped?.[1] && parenWrapped[2]) {
		return `\\(${markdownLink(parenWrapped[1], parenWrapped[2])}\\)`;
	}

	const bareLink = segment.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
	if (bareLink?.[1] && bareLink[2]) {
		return markdownLink(bareLink[1], bareLink[2]);
	}

	return escapeMarkdownV2(segment);
}

/** Convert markdown links in macro briefing prose to Telegram MarkdownV2. */
export function formatMacroBriefingContentForTelegram(content: string): string {
	return content.split(TELEGRAM_SEGMENT).map(formatTelegramSegment).join("");
}
