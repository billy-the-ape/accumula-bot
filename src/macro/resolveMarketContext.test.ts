import { describe, expect, it } from "vitest";
import { MACRO_BRIEFING_MAX_AGE_MS } from "@/macro/macroBriefingPrompt.js";
import {
	getMacroBriefingAsOf,
	loadFreshMarketContext,
	resolveFreshMarketContext,
} from "@/macro/resolveMarketContext.js";
import { type AppDatabase, createDatabase } from "@/storage/db.js";
import { saveMacroBriefing } from "@/storage/repositories/macroBriefingRepository.js";

describe("resolveFreshMarketContext", () => {
	const now = new Date("2026-06-16T12:00:00.000Z");

	it("returns context when the briefing is within the max age", () => {
		const generatedAt = new Date("2026-06-16T06:00:00.000Z");

		expect(
			resolveFreshMarketContext(
				{
					id: 1,
					createdAt: generatedAt,
					content: "Risk-off ahead of CPI.",
					promptVersion: "v2",
					llm: { provider: "openai_compatible", model: "gpt-5.5" },
				},
				{ now },
			),
		).toEqual({
			content: "Risk-off ahead of CPI.",
			generatedAt,
		});
	});

	it("returns undefined when the briefing is stale", () => {
		const generatedAt = new Date("2026-06-14T12:00:00.000Z");

		expect(
			resolveFreshMarketContext(
				{
					id: 1,
					createdAt: generatedAt,
					content: "Old macro read.",
					promptVersion: "v2",
					llm: { provider: "openai_compatible", model: "gpt-5.5" },
				},
				{ now, maxAgeMs: MACRO_BRIEFING_MAX_AGE_MS },
			),
		).toBeUndefined();
	});

	it("returns undefined when no briefing exists", () => {
		expect(resolveFreshMarketContext(undefined, { now })).toBeUndefined();
	});
});

describe("getMacroBriefingAsOf", () => {
	it("returns the latest briefing that was fresh at the decision time", async () => {
		const connection = await createDatabase(":memory:");
		const db = connection.db;

		await saveMacroBriefing(db, {
			content: "Stale macro read.",
			promptVersion: "v2",
			llm: { provider: "openai_compatible", model: "gpt-5.5" },
			createdAt: new Date("2026-06-14T12:00:00.000Z"),
		});

		await saveMacroBriefing(db, {
			content: "Fresh at decision time.",
			promptVersion: "v2",
			llm: { provider: "openai_compatible", model: "gpt-5.5" },
			createdAt: new Date("2026-06-16T06:00:00.000Z"),
		});

		const briefing = await getMacroBriefingAsOf(
			db,
			new Date("2026-06-16T12:00:00.000Z"),
		);

		expect(briefing?.content).toBe("Fresh at decision time.");

		connection.client.close();
	});

	it("returns undefined when no briefing was fresh at the decision time", async () => {
		const connection = await createDatabase(":memory:");
		const db = connection.db;

		await saveMacroBriefing(db, {
			content: "Too old for this decision.",
			promptVersion: "v2",
			llm: { provider: "openai_compatible", model: "gpt-5.5" },
			createdAt: new Date("2026-06-14T12:00:00.000Z"),
		});

		const briefing = await getMacroBriefingAsOf(
			db,
			new Date("2026-06-16T12:00:00.000Z"),
		);

		expect(briefing).toBeUndefined();

		connection.client.close();
	});
});

describe("loadFreshMarketContext", () => {
	let db: AppDatabase | undefined;

	it("loads the latest fresh briefing from the database", async () => {
		const connection = await createDatabase(":memory:");
		db = connection.db;

		const createdAt = new Date("2026-06-16T06:00:00.000Z");
		await saveMacroBriefing(db, {
			content: "ETF flows steady; CPI tomorrow.",
			promptVersion: "v2",
			llm: { provider: "openai_compatible", model: "gpt-5.5" },
			createdAt,
		});

		const context = await loadFreshMarketContext(db, {
			now: new Date("2026-06-16T12:00:00.000Z"),
		});

		expect(context).toEqual({
			content: "ETF flows steady; CPI tomorrow.",
			generatedAt: createdAt,
		});

		connection.client.close();
	});
});
