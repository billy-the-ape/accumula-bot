import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";

/** Compact one-line-per-post format for Stage 1a relevance filtering. */
export function formatSocialMediaRelevancePosts(
	signals: readonly SocialMediaSignal[],
): string {
	return signals
		.map(
			(signal) =>
				`[post_id=${signal.index}] @${signal.username} (${signal.asOf}): ${signal.text}`,
		)
		.join("\n");
}
