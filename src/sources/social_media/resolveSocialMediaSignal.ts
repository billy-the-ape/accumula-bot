import type { SocialMediaAnalysisTopPost } from "@/schemas/SocialMediaAnalysis.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";

export const MAX_SOCIAL_MEDIA_POST_SUMMARY_CHARS = 100;

/** Collapse whitespace and strip t.co tracking links for prompt input. */
export function normalizeSocialMediaPostText(text: string): string {
	return text
		.replace(/\s+/g, " ")
		.replace(/\s*https?:\/\/t\.co\/\S+/gi, "")
		.trim();
}

/** Prompt-only normalization: also lowercase to avoid ALL-CAPS wire bias (e.g. DeItaone). */
export function normalizeSocialMediaPostTextForPrompt(text: string): string {
	return normalizeSocialMediaPostText(text).toLowerCase();
}

export function truncateSocialMediaPostText(
	text: string,
	maxChars = MAX_SOCIAL_MEDIA_POST_SUMMARY_CHARS,
): string {
	const normalized = normalizeSocialMediaPostText(text);
	if (normalized.length <= maxChars) {
		return normalized;
	}

	return `${normalized.slice(0, maxChars - 1)}…`;
}

/** Resolve the source tweet for a ranked post (index-first, then composite id). */
export function resolveSocialMediaSignalForTopPost(
	topPost: Pick<SocialMediaAnalysisTopPost, "post_id" | "id">,
	signals: readonly SocialMediaSignal[],
): SocialMediaSignal | undefined {
	const byIndex = new Map(signals.map((signal) => [signal.index, signal]));
	const byId = new Map(signals.map((signal) => [signal.id, signal]));
	const externalId = topPost.id.replace(/^twitter:/, "");

	return byIndex.get(topPost.post_id) ?? byId.get(externalId);
}

export function summarizeSocialMediaSignal(
	signal: Pick<SocialMediaSignal, "text">,
): string {
	return truncateSocialMediaPostText(signal.text);
}
