import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal";

export function formatSocialMediaSignals(
	signals: readonly SocialMediaSignal[],
): string {
	return signals
		.map(
			(signal) =>
				`[index=${signal.index}] Posted by @${signal.username} at ${signal.asOf}: ${signal.text}`,
		)
		.join("\n");
}
