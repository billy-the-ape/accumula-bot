import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";

/** Newest-first order used in the Stage 1 prompt ([post_id=N] uses signal.index). */
export function orderSocialMediaPromptSignals(
	signals: readonly SocialMediaSignal[],
): SocialMediaSignal[] {
	return [...signals].sort(
		(left, right) =>
			new Date(right.asOf).getTime() - new Date(left.asOf).getTime(),
	);
}
