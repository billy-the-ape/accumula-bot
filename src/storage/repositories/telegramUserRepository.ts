import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/storage/db.js";
import { type TelegramUserRow, telegramUsers } from "@/storage/schema.js";

export type OnboardingState =
	| "awaiting_starting_value"
	| "awaiting_risk_tolerance";

export type StoredTelegramUser = {
	id: number;
	telegramChatId: string;
	onboardingState: OnboardingState | null;
	onboardingDraftJson: string | null;
	createdAt: Date;
	updatedAt: Date;
};

function mapTelegramUserRow(row: TelegramUserRow): StoredTelegramUser {
	return {
		id: row.id,
		telegramChatId: row.telegramChatId,
		onboardingState: row.onboardingState as OnboardingState | null,
		onboardingDraftJson: row.onboardingDraftJson,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export async function findTelegramUserByChatId(
	db: AppDatabase,
	telegramChatId: string,
): Promise<StoredTelegramUser | undefined> {
	const row = await db
		.select()
		.from(telegramUsers)
		.where(eq(telegramUsers.telegramChatId, telegramChatId))
		.get();

	return row ? mapTelegramUserRow(row) : undefined;
}

export async function getOrCreateTelegramUser(
	db: AppDatabase,
	telegramChatId: string,
): Promise<StoredTelegramUser> {
	const existing = await findTelegramUserByChatId(db, telegramChatId);
	if (existing) {
		return existing;
	}

	const now = new Date();
	const [row] = await db
		.insert(telegramUsers)
		.values({
			telegramChatId,
			onboardingState: "awaiting_starting_value",
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create telegram user");
	}

	return mapTelegramUserRow(row);
}

export async function updateTelegramUserOnboarding(
	db: AppDatabase,
	userId: number,
	patch: {
		onboardingState?: OnboardingState | null;
		onboardingDraftJson?: string | null;
	},
): Promise<StoredTelegramUser> {
	const [row] = await db
		.update(telegramUsers)
		.set({
			...(patch.onboardingState !== undefined
				? { onboardingState: patch.onboardingState }
				: {}),
			...(patch.onboardingDraftJson !== undefined
				? { onboardingDraftJson: patch.onboardingDraftJson }
				: {}),
			updatedAt: new Date(),
		})
		.where(eq(telegramUsers.id, userId))
		.returning();

	if (!row) {
		throw new Error(`Telegram user ${userId} not found`);
	}

	return mapTelegramUserRow(row);
}
