import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import type { ScoredSocialMediaPost } from "@/schemas/ScoredSocialMediaPost.js";
import type { SocialMediaSource } from "@/schemas/SocialMediaSignal.js";
import type { AppDatabase } from "@/storage/db.js";
import { type SocialMediaPostRow, socialMediaPosts } from "@/storage/schema.js";

export type SaveScoredSocialMediaPostInput = {
	externalId: string;
	source: SocialMediaSource;
	username: string;
	text: string;
	postedAt: Date;
	impressions: number;
	relevanceScore: number;
	scoredAt?: Date;
	llm: {
		provider: string;
		model: string;
	};
};

function mapRowToScoredSocialMediaPost(
	row: SocialMediaPostRow,
): ScoredSocialMediaPost {
	return {
		externalId: row.externalId,
		source: row.source as SocialMediaSource,
		username: row.username,
		text: row.text,
		postedAt: row.postedAt.toISOString(),
		impressions: row.impressions,
		relevanceScore: row.relevanceScore,
		scoredAt: row.scoredAt.toISOString(),
	};
}

export async function getScoredExternalIds(
	db: AppDatabase,
	source: SocialMediaSource,
	externalIds: readonly string[],
): Promise<Set<string>> {
	if (externalIds.length === 0) {
		return new Set();
	}

	const rows = await db
		.select({ externalId: socialMediaPosts.externalId })
		.from(socialMediaPosts)
		.where(
			and(
				eq(socialMediaPosts.source, source),
				inArray(socialMediaPosts.externalId, [...externalIds]),
			),
		);

	return new Set(rows.map((row) => row.externalId));
}

export async function saveScoredSocialMediaPosts(
	db: AppDatabase,
	posts: readonly SaveScoredSocialMediaPostInput[],
): Promise<void> {
	if (posts.length === 0) {
		return;
	}

	await db.insert(socialMediaPosts).values(
		posts.map((post) => ({
			externalId: post.externalId,
			source: post.source,
			username: post.username,
			text: post.text,
			postedAt: post.postedAt,
			impressions: post.impressions,
			relevanceScore: post.relevanceScore,
			scoredAt: post.scoredAt ?? new Date(),
			llmProvider: post.llm.provider,
			llmModel: post.llm.model,
		})),
	);
}

export type GetTopScoredSocialMediaPostsOptions = {
	since: Date;
	minScore: number;
	limit: number;
};

export async function getTopScoredSocialMediaPosts(
	db: AppDatabase,
	options: GetTopScoredSocialMediaPostsOptions,
): Promise<ScoredSocialMediaPost[]> {
	const rows = await db
		.select()
		.from(socialMediaPosts)
		.where(
			and(
				gte(socialMediaPosts.postedAt, options.since),
				gte(socialMediaPosts.relevanceScore, options.minScore),
			),
		)
		.orderBy(
			desc(socialMediaPosts.relevanceScore),
			desc(socialMediaPosts.postedAt),
		)
		.limit(options.limit)
		.all();

	return rows.map(mapRowToScoredSocialMediaPost);
}

export async function deleteSocialMediaPostsOlderThan(
	db: AppDatabase,
	cutoff: Date,
): Promise<number> {
	const deleted = await db
		.delete(socialMediaPosts)
		.where(lt(socialMediaPosts.postedAt, cutoff))
		.returning({ id: socialMediaPosts.id });

	return deleted.length;
}
