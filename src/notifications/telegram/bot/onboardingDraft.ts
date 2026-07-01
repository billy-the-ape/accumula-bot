import type { OnboardingDraft } from "@/notifications/telegram/bot/types.js";

export function parseOnboardingDraft(
	json: string | null,
): OnboardingDraft | undefined {
	if (!json) {
		return undefined;
	}

	try {
		const parsed: unknown = JSON.parse(json);
		if (typeof parsed !== "object" || parsed === null) {
			return undefined;
		}

		const draft = parsed as OnboardingDraft;
		if (
			draft.startingValueUsd !== undefined &&
			typeof draft.startingValueUsd !== "number"
		) {
			return undefined;
		}
		if (
			draft.mode !== undefined &&
			draft.mode !== "paper" &&
			draft.mode !== "live"
		) {
			return undefined;
		}

		return draft;
	} catch {
		return undefined;
	}
}

export function serializeOnboardingDraft(draft: OnboardingDraft): string {
	return JSON.stringify(draft);
}
