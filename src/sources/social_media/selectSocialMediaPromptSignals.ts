import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";

/** Max posts embedded in the Stage 1 LLM prompt (full fetch count still reported). */
export const DEFAULT_SOCIAL_MEDIA_MAX_PROMPT_POSTS = 500;

export function selectSocialMediaPromptSignals(
	signals: readonly SocialMediaSignal[],
	maxPosts = DEFAULT_SOCIAL_MEDIA_MAX_PROMPT_POSTS,
): SocialMediaSignal[] {
	if (signals.length <= maxPosts) {
		return [...signals];
	}
	return (
		[...signals]
			// newest first
			.sort(
				(left, right) =>
					new Date(right.asOf).getTime() - new Date(left.asOf).getTime(),
			)
			.slice(0, maxPosts)
	);
}
