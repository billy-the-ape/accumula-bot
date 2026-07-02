import { desc, lte } from "drizzle-orm";
import type { AppConfig } from "@/config/index.js";
import type { SocialMediaMarketContext } from "@/llm/socialMediaPromptShared.js";
import { MACRO_BRIEFING_MAX_AGE_MS } from "@/macro/macroBriefingPrompt.js";
import type { AppDatabase } from "@/storage/db.js";
import { createDatabase } from "@/storage/db.js";
import {
	getLatestMacroBriefing,
	type StoredMacroBriefing,
} from "@/storage/repositories/macroBriefingRepository.js";
import { macroBriefings } from "@/storage/schema.js";

export type ResolveFreshMarketContextOptions = {
	now?: Date;
	maxAgeMs?: number;
};

export function resolveFreshMarketContext(
	briefing: StoredMacroBriefing | undefined,
	options: ResolveFreshMarketContextOptions = {},
): SocialMediaMarketContext | undefined {
	if (!briefing) {
		return undefined;
	}

	const now = options.now ?? new Date();
	const maxAgeMs = options.maxAgeMs ?? MACRO_BRIEFING_MAX_AGE_MS;
	const ageMs = now.getTime() - briefing.createdAt.getTime();

	if (ageMs > maxAgeMs) {
		return undefined;
	}

	return {
		content: briefing.content,
		generatedAt: briefing.createdAt,
	};
}

export async function loadFreshMarketContext(
	db: AppDatabase,
	options: ResolveFreshMarketContextOptions = {},
): Promise<SocialMediaMarketContext | undefined> {
	const briefing = await getLatestMacroBriefing(db);
	return resolveFreshMarketContext(briefing, options);
}

export async function getMacroBriefingAsOf(
	db: AppDatabase,
	asOf: Date,
	options: ResolveFreshMarketContextOptions = {},
): Promise<StoredMacroBriefing | undefined> {
	const row = await db
		.select()
		.from(macroBriefings)
		.where(lte(macroBriefings.createdAt, asOf))
		.orderBy(desc(macroBriefings.createdAt), desc(macroBriefings.id))
		.limit(1)
		.get();

	if (!row) {
		return undefined;
	}

	const briefing: StoredMacroBriefing = {
		id: row.id,
		createdAt: row.createdAt,
		content: row.content,
		promptVersion: row.promptVersion,
		llm: {
			provider: row.llmProvider,
			model: row.llmModel,
		},
	};

	return resolveFreshMarketContext(briefing, { ...options, now: asOf })
		? briefing
		: undefined;
}

export async function loadMarketContextFromConfig(
	config: AppConfig,
	options: ResolveFreshMarketContextOptions = {},
): Promise<SocialMediaMarketContext | undefined> {
	const connection = await createDatabase(config.databasePath);
	try {
		return await loadFreshMarketContext(connection.db, options);
	} finally {
		connection.client.close();
	}
}
