import type { AppConfig } from "@/config/index.js";
import type { SocialMediaMarketContext } from "@/llm/socialMediaPromptShared.js";
import { MACRO_BRIEFING_MAX_AGE_MS } from "@/macro/macroBriefingPrompt.js";
import type { AppDatabase } from "@/storage/db.js";
import { createDatabase } from "@/storage/db.js";
import {
	getLatestMacroBriefing,
	type StoredMacroBriefing,
} from "@/storage/repositories/macroBriefingRepository.js";

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
