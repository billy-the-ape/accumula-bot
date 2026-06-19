import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
import {
	deleteSocialMediaPostsOlderThan,
	getScoredExternalIds,
	getTopScoredSocialMediaPosts,
	saveScoredSocialMediaPosts,
} from "@/storage/repositories/socialMediaPostRepository.js";

describe("socialMediaPostRepository", () => {
	let client: Client | undefined;
	let db: AppDatabase | undefined;

	afterEach(() => {
		client?.close();
		client = undefined;
		db = undefined;
	});

	it("persists scored posts and finds existing external ids", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		await saveScoredSocialMediaPosts(db, [
			{
				externalId: "111",
				source: "twitter",
				username: "whale_alert",
				text: "Large BTC transfer",
				postedAt: new Date("2026-06-19T12:00:00.000Z"),
				impressions: 42_000,
				relevanceScore: 9,
				llm: { provider: "ollama", model: "qwen3:8b" },
			},
		]);

		const existing = await getScoredExternalIds(db, "twitter", ["111", "222"]);
		expect(existing).toEqual(new Set(["111"]));
	});

	it("returns top scored posts within the window and score threshold", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		await saveScoredSocialMediaPosts(db, [
			{
				externalId: "111",
				source: "twitter",
				username: "whale_alert",
				text: "Large BTC transfer",
				postedAt: new Date("2026-06-19T12:00:00.000Z"),
				impressions: 42_000,
				relevanceScore: 9,
				llm: { provider: "ollama", model: "qwen3:8b" },
			},
			{
				externalId: "222",
				source: "twitter",
				username: "CoinDesk",
				text: "Low impact headline",
				postedAt: new Date("2026-06-19T11:00:00.000Z"),
				impressions: 1_000,
				relevanceScore: 3,
				llm: { provider: "ollama", model: "qwen3:8b" },
			},
			{
				externalId: "333",
				source: "twitter",
				username: "ReutersBiz",
				text: "Fed commentary",
				postedAt: new Date("2026-06-19T10:00:00.000Z"),
				impressions: 5_000,
				relevanceScore: 7,
				llm: { provider: "ollama", model: "qwen3:8b" },
			},
		]);

		const top = await getTopScoredSocialMediaPosts(db, {
			since: new Date("2026-06-19T09:00:00.000Z"),
			minScore: 4,
			limit: 10,
		});

		expect(top.map((post) => post.externalId)).toEqual(["111", "333"]);
		expect(top[0]?.relevanceScore).toBe(9);
	});

	it("deletes posts older than the cutoff", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		await saveScoredSocialMediaPosts(db, [
			{
				externalId: "old",
				source: "twitter",
				username: "WSJ",
				text: "Old headline",
				postedAt: new Date("2026-06-17T12:00:00.000Z"),
				impressions: 100,
				relevanceScore: 8,
				llm: { provider: "ollama", model: "qwen3:8b" },
			},
			{
				externalId: "new",
				source: "twitter",
				username: "WSJ",
				text: "Fresh headline",
				postedAt: new Date("2026-06-19T12:00:00.000Z"),
				impressions: 100,
				relevanceScore: 8,
				llm: { provider: "ollama", model: "qwen3:8b" },
			},
		]);

		const deleted = await deleteSocialMediaPostsOlderThan(
			db,
			new Date("2026-06-18T00:00:00.000Z"),
		);
		expect(deleted).toBe(1);

		const remaining = await getTopScoredSocialMediaPosts(db, {
			since: new Date("2026-06-01T00:00:00.000Z"),
			minScore: 1,
			limit: 10,
		});
		expect(remaining.map((post) => post.externalId)).toEqual(["new"]);
	});
});
