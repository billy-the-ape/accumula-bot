import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal";
import { TWITTER_ACCOUNTS_TAG_MAP } from "@/sources/social_media/twitterClient/twitterClient";

function mapSignal(signal: SocialMediaSignal) {
	return `[post_id=${signal.index}] Posted by @${signal.username} at ${signal.asOf}: ${signal.text}`;
}

export function formatSocialMediaSignals(
	signals: readonly SocialMediaSignal[],
): string {
	const lines: string[] = [];
	for (const [tag, tagAccounts] of Object.entries(TWITTER_ACCOUNTS_TAG_MAP)) {
		const lowercaseTagAccounts = tagAccounts.map((account) =>
			account.toLowerCase(),
		);
		const signalsForTag = signals.filter((signal) =>
			lowercaseTagAccounts.includes(signal.username.toLowerCase()),
		);
		if (signalsForTag.length > 0) {
			lines.push(
				`[users tagged=${tag}]`,
				...signalsForTag.map(mapSignal),
				`[end users tagged=${tag}]`,
				"",
			);
		}
	}

	return lines.join("\n");
}
