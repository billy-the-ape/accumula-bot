import { eq } from "drizzle-orm";
import type { TelegramFromUser } from "@/notifications/telegram/telegramClient.js";
import type { AppDatabase } from "@/storage/db.js";
import { type TelegramUserRow, telegramUsers } from "@/storage/schema.js";
import {
	resolveTelegramUserSettings,
	type TelegramUserSettings,
} from "@/storage/telegramUserSettings.js";

export type OnboardingState =
	| "awaiting_mode_selection"
	| "awaiting_starting_value"
	| "awaiting_live_deposit"
	| "awaiting_risk_tolerance"
	| "awaiting_liquidate_address"
	| "awaiting_liquidate_confirm"
	| "awaiting_settings_locale"
	| "awaiting_settings_timezone"
	| "awaiting_portfolio_risk_custom";

export type StoredTelegramUser = {
	id: number;
	telegramChatId: string;
	onboardingState: OnboardingState | null;
	onboardingDraftJson: string | null;
	settings: TelegramUserSettings;
	from: TelegramFromUser | null;
	createdAt: Date;
	updatedAt: Date;
};

function mapTelegramFromUserRow(row: TelegramUserRow): TelegramFromUser | null {
	if (!row.telegramFromUserId || !row.firstName) {
		return null;
	}

	return {
		id: row.telegramFromUserId,
		isBot: row.isBot,
		firstName: row.firstName,
		lastName: row.lastName,
		username: row.telegramUsername,
		languageCode: row.languageCode,
		isPremium: row.isPremium,
	};
}

function telegramFromUserToRow(from: TelegramFromUser) {
	return {
		telegramFromUserId: from.id,
		firstName: from.firstName,
		lastName: from.lastName,
		telegramUsername: from.username,
		languageCode: from.languageCode,
		isBot: from.isBot,
		isPremium: from.isPremium,
	};
}

function mapTelegramUserRow(row: TelegramUserRow): StoredTelegramUser {
	return {
		id: row.id,
		telegramChatId: row.telegramChatId,
		onboardingState: row.onboardingState as OnboardingState | null,
		onboardingDraftJson: row.onboardingDraftJson,
		settings: resolveTelegramUserSettings({
			verbose: row.verbose,
			defaultRiskTolerance: row.defaultRiskTolerance,
			locale: row.locale,
			timezone: row.timezone,
		}),
		from: mapTelegramFromUserRow(row),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export async function findTelegramUserById(
	db: AppDatabase,
	userId: number,
): Promise<StoredTelegramUser | undefined> {
	const row = await db
		.select()
		.from(telegramUsers)
		.where(eq(telegramUsers.id, userId))
		.get();

	return row ? mapTelegramUserRow(row) : undefined;
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
	from?: TelegramFromUser,
): Promise<StoredTelegramUser> {
	const existing = await findTelegramUserByChatId(db, telegramChatId);
	if (existing) {
		if (from) {
			return updateTelegramUserFrom(db, existing.id, from);
		}

		return existing;
	}

	const now = new Date();
	const [row] = await db
		.insert(telegramUsers)
		.values({
			telegramChatId,
			onboardingState: "awaiting_mode_selection",
			...(from ? telegramFromUserToRow(from) : {}),
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create telegram user");
	}

	return mapTelegramUserRow(row);
}

export async function updateTelegramUserFrom(
	db: AppDatabase,
	userId: number,
	from: TelegramFromUser,
): Promise<StoredTelegramUser> {
	const [row] = await db
		.update(telegramUsers)
		.set({
			...telegramFromUserToRow(from),
			updatedAt: new Date(),
		})
		.where(eq(telegramUsers.id, userId))
		.returning();

	if (!row) {
		throw new Error(`Telegram user ${userId} not found`);
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

export async function updateTelegramUserSettings(
	db: AppDatabase,
	userId: number,
	settings: Partial<TelegramUserSettings>,
): Promise<StoredTelegramUser> {
	const existing = await db
		.select()
		.from(telegramUsers)
		.where(eq(telegramUsers.id, userId))
		.get();

	if (!existing) {
		throw new Error(`Telegram user ${userId} not found`);
	}

	const nextSettings = {
		...resolveTelegramUserSettings({
			verbose: existing.verbose,
			defaultRiskTolerance: existing.defaultRiskTolerance,
			locale: existing.locale,
			timezone: existing.timezone,
		}),
		...settings,
	};

	const [row] = await db
		.update(telegramUsers)
		.set({
			verbose: nextSettings.verbose,
			defaultRiskTolerance: nextSettings.defaultRiskTolerance,
			locale: nextSettings.locale,
			timezone: nextSettings.timezone,
			updatedAt: new Date(),
		})
		.where(eq(telegramUsers.id, userId))
		.returning();

	if (!row) {
		throw new Error(`Telegram user ${userId} not found`);
	}

	return mapTelegramUserRow(row);
}
