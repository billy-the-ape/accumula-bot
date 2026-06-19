import type { ScoredSocialMediaPost } from "@/schemas/ScoredSocialMediaPost.js";
import { normalizeSocialMediaPostTextForPrompt } from "@/sources/social_media/resolveSocialMediaSignal.js";

export function formatScoredSocialMediaPosts(
	posts: readonly ScoredSocialMediaPost[],
): string {
	if (posts.length === 0) {
		return "No scored social media posts met the relevance threshold in the last 24 hours.";
	}

	const lines = [
		"Top social media signals (last 24h, relevance >= 4):",
		...posts.map((post, index) => {
			const text = normalizeSocialMediaPostTextForPrompt(post.text);
			return `${index + 1}. [score=${post.relevanceScore}] @${post.username} (${post.postedAt}): ${text}`;
		}),
	];

	return lines.join("\n");
}
