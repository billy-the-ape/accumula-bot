/** Characters that must be escaped outside Telegram MarkdownV2 entities. */
const MARKDOWN_V2_ESCAPABLE = /[_*[\]()~`>#+\-=|{}.!\\]/g;

/** Escape text for Telegram MarkdownV2 (outside inline link URLs). */
export function escapeMarkdownV2(value: string): string {
	return value.replace(MARKDOWN_V2_ESCAPABLE, "\\$&");
}

/** Escape an inline-link URL (only `)` and `\` are required). */
export function escapeMarkdownV2Url(value: string): string {
	return value.replace(/[)\\]/g, "\\$&");
}

export function bold(value: string): string {
	return `*${escapeMarkdownV2(value)}*`;
}

export function italic(value: string): string {
	return `_${escapeMarkdownV2(value)}_`;
}

export function underline(value: string): string {
	return `__${escapeMarkdownV2(value)}__`;
}

/** Underline wrapping bold — matches former `<u><b>…</b></u>`. */
export function boldUnderline(value: string): string {
	return `__*${escapeMarkdownV2(value)}*__`;
}

/** Bold wrapping underline — matches former `<b><u>…</u></b>`. */
export function underlineBold(value: string): string {
	return `*__${escapeMarkdownV2(value)}__*`;
}

export function markdownLink(text: string, url: string): string {
	return `[${escapeMarkdownV2(text)}](${escapeMarkdownV2Url(url)})`;
}

export function boldLink(text: string, url: string): string {
	return `*[${escapeMarkdownV2(text)}](${escapeMarkdownV2Url(url)})*`;
}

export function code(value: string): string {
	return `\`${escapeMarkdownV2(value)}\``;
}
