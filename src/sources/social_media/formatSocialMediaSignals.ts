import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal";

export function formatSocialMediaSignals(
	signals: readonly SocialMediaSignal[],
): string {
	return signals
		.map(
			(signal) =>
				`Posted by ${signal.source} user @${signal.username} at ${signal.asOf}: ${signal.text}`,
		)
		.join("\n");
}
