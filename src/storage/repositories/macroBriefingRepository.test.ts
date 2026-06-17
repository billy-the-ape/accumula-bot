import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
import {
	getLatestMacroBriefing,
	saveMacroBriefing,
} from "@/storage/repositories/macroBriefingRepository.js";

describe("macroBriefingRepository", () => {
	let client: Client | undefined;
	let db: AppDatabase | undefined;

	afterEach(() => {
		client?.close();
		client = undefined;
		db = undefined;
	});

	it("persists and reads a macro briefing", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		const saved = await saveMacroBriefing(db, {
			content: "Risk-off tone ahead of CPI.",
			promptVersion: "v1",
			llm: {
				provider: "openai_compatible",
				model: "gpt-4o",
			},
		});

		expect(saved.id).toBeGreaterThan(0);
		expect(saved.content).toBe("Risk-off tone ahead of CPI.");
		expect(saved.promptVersion).toBe("v1");
		expect(saved.llm).toEqual({
			provider: "openai_compatible",
			model: "gpt-4o",
		});
		expect(saved.createdAt).toBeInstanceOf(Date);
	});

	it("returns undefined when no briefings exist", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		expect(await getLatestMacroBriefing(db)).toBeUndefined();
	});

	it("returns the newest briefing by createdAt", async () => {
		const connection = await createDatabase(":memory:");
		client = connection.client;
		db = connection.db;

		await saveMacroBriefing(db, {
			content: "Older macro read.",
			promptVersion: "v1",
			createdAt: new Date("2026-06-15T07:00:00.000Z"),
			llm: { provider: "openai_compatible", model: "gpt-4o" },
		});

		await saveMacroBriefing(db, {
			content: "Latest macro read.",
			promptVersion: "v1",
			createdAt: new Date("2026-06-16T07:00:00.000Z"),
			llm: { provider: "openai_compatible", model: "gpt-4o" },
		});

		const latest = await getLatestMacroBriefing(db);
		expect(latest?.content).toBe("Latest macro read.");
		expect(latest?.createdAt.toISOString()).toBe("2026-06-16T07:00:00.000Z");
	});
});
