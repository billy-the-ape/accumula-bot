import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";

/** Limit high-volume accounts (e.g. wire bots) so one user cannot dominate the prompt. */
export const DEFAULT_MAX_PROMPT_POSTS_PER_ACCOUNT = 8;

export function capSocialMediaPromptSignalsPerAccount(
	signals: readonly SocialMediaSignal[],
	maxPerAccount = DEFAULT_MAX_PROMPT_POSTS_PER_ACCOUNT,
): SocialMediaSignal[] {
	const byAccount = new Map<string, SocialMediaSignal[]>();

	for (const signal of signals) {
		const key = signal.username.toLowerCase();
		const bucket = byAccount.get(key) ?? [];
		bucket.push(signal);
		byAccount.set(key, bucket);
	}

	const capped: SocialMediaSignal[] = [];
	for (const bucket of byAccount.values()) {
		const newestFirst = [...bucket].sort(
			(left, right) =>
				new Date(right.asOf).getTime() - new Date(left.asOf).getTime(),
		);
		capped.push(...newestFirst.slice(0, maxPerAccount));
	}

	return capped.sort(
		(left, right) =>
			new Date(right.asOf).getTime() - new Date(left.asOf).getTime(),
	);
}
