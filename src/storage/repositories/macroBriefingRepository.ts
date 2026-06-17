import { desc } from "drizzle-orm";
import type { AppDatabase } from "@/storage/db.js";
import { type MacroBriefingRow, macroBriefings } from "@/storage/schema.js";

export type SaveMacroBriefingInput = {
	content: string;
	promptVersion: string;
	llm: {
		provider: string;
		model: string;
	};
	createdAt?: Date;
};

export type StoredMacroBriefing = {
	id: number;
	createdAt: Date;
	content: string;
	promptVersion: string;
	llm: {
		provider: string;
		model: string;
	};
};

function mapRowToStoredMacroBriefing(
	row: MacroBriefingRow,
): StoredMacroBriefing {
	return {
		id: row.id,
		createdAt: row.createdAt,
		content: row.content,
		promptVersion: row.promptVersion,
		llm: {
			provider: row.llmProvider,
			model: row.llmModel,
		},
	};
}

export async function saveMacroBriefing(
	db: AppDatabase,
	input: SaveMacroBriefingInput,
): Promise<StoredMacroBriefing> {
	const [row] = await db
		.insert(macroBriefings)
		.values({
			createdAt: input.createdAt ?? new Date(),
			content: input.content,
			llmProvider: input.llm.provider,
			llmModel: input.llm.model,
			promptVersion: input.promptVersion,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to persist macro briefing");
	}

	return mapRowToStoredMacroBriefing(row);
}

export async function getLatestMacroBriefing(
	db: AppDatabase,
): Promise<StoredMacroBriefing | undefined> {
	const row = await db
		.select()
		.from(macroBriefings)
		.orderBy(desc(macroBriefings.createdAt), desc(macroBriefings.id))
		.limit(1)
		.get();

	return row ? mapRowToStoredMacroBriefing(row) : undefined;
}
