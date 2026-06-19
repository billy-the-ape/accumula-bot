import type { SocialMediaAnalysis } from "@/schemas/SocialMediaAnalysis.js";
import {
	formatSocialMediaPostId,
	type SocialMediaSignal,
} from "@/schemas/SocialMediaSignal.js";
import { normalizeSocialMediaPostTextForPrompt } from "@/sources/social_media/resolveSocialMediaSignal.js";

/** Full post text included for the top N ranked posts (Stage 2 grounding). */
export const SOCIAL_MEDIA_TOP_POST_FULL_TEXT_COUNT = 3;

function indexSignalsByPostId(
	signals: readonly SocialMediaSignal[],
): Map<string, SocialMediaSignal> {
	return new Map(
		signals.map((signal) => [formatSocialMediaPostId(signal), signal]),
	);
}

function formatTopPostLine(
	topPost: SocialMediaAnalysis["top_posts"][number],
): string {
	const headline = `[id=${topPost.id}] @${topPost.username} (${topPost.relevance}) — ${topPost.summary}`;
	return `  ${topPost.rank}. ${headline}\n     why: ${topPost.why}`;
}

function formatTopPostFullText(
	topPost: SocialMediaAnalysis["top_posts"][number],
	signalsById: Map<string, SocialMediaSignal>,
): string | undefined {
	const signal = signalsById.get(topPost.id);
	if (!signal) {
		return undefined;
	}

	return `[id=${topPost.id}] @${signal.username}: ${normalizeSocialMediaPostTextForPrompt(signal.text)}`;
}

/**
 * Render Stage 1 social analysis as a compact digest for the portfolio-outlook
 * prompt. Resolves full text for the top-ranked posts from the original signals.
 */
export function formatSocialMediaAnalysis(
	analysis: SocialMediaAnalysis,
	signals: readonly SocialMediaSignal[],
): string {
	const lines: string[] = [
		`retrieved=${analysis.total_retrieved} informative=${analysis.relevant_count}`,
		`summary: ${analysis.summary}`,
	];

	if (analysis.themes.length > 0) {
		lines.push(`themes: ${analysis.themes.join(", ")}`);
	}

	if (analysis.by_asset.length > 0) {
		lines.push("by_asset:");
		for (const entry of analysis.by_asset) {
			lines.push(
				`  ${entry.asset}: sentiment=${entry.sentiment} — ${entry.note}`,
			);
		}
	}

	const sortedTopPosts = [...analysis.top_posts].sort(
		(a, b) => a.rank - b.rank,
	);

	if (sortedTopPosts.length > 0) {
		lines.push("top_signals:");
		lines.push(...sortedTopPosts.map((topPost) => formatTopPostLine(topPost)));
	}

	const signalsById = indexSignalsByPostId(signals);
	const fullTextLines = sortedTopPosts
		.slice(0, SOCIAL_MEDIA_TOP_POST_FULL_TEXT_COUNT)
		.map((topPost) => formatTopPostFullText(topPost, signalsById))
		.filter((line): line is string => line !== undefined);

	if (fullTextLines.length > 0) {
		lines.push("top_post_full_text:");
		lines.push(...fullTextLines.map((line) => `  ${line}`));
	}

	return lines.join("\n");
}
