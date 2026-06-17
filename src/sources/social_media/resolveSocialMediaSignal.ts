import type { SocialMediaAnalysisTopPost } from "@/schemas/SocialMediaAnalysis.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";

export const MAX_SOCIAL_MEDIA_POST_SUMMARY_CHARS = 100;

export function truncateSocialMediaPostText(
	text: string,
	maxChars = MAX_SOCIAL_MEDIA_POST_SUMMARY_CHARS,
): string {
	const normalized =
		text.replace(/\s+/g, " ").trim().split("https://t.co/")[0] ?? text;
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
