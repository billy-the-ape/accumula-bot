import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal";
import { normalizeSocialMediaPostTextForPrompt } from "@/sources/social_media/resolveSocialMediaSignal.js";

function mapSignal(signal: SocialMediaSignal) {
	return `[post_id=${signal.index}] Posted by @${signal.username} at ${signal.asOf}: ${normalizeSocialMediaPostTextForPrompt(signal.text)}`;
}

export function formatSocialMediaSignals(
	signals: readonly SocialMediaSignal[],
): string {
	return signals.map(mapSignal).join("\n");
}
