import { getMacroBriefingAsOf } from "@/macro/resolveMarketContext.js";
import { userCanAccessDecision } from "@/notifications/telegram/buildDecisionReport.js";
import {
	formatMacroBriefingMessage,
	NO_MACRO_BRIEFING_MESSAGE,
	NO_MACRO_FOR_DECISION_MESSAGE,
} from "@/notifications/telegram/formatMacroBriefingMessage.js";
import type { AppDatabase } from "@/storage/db.js";
import { findDecisionById } from "@/storage/repositories/decisionRepository.js";
import { getLatestMacroBriefing } from "@/storage/repositories/macroBriefingRepository.js";
import { findTelegramUserById } from "@/storage/repositories/telegramUserRepository.js";

export async function buildLatestMacroBriefingMessage(
	db: AppDatabase,
	telegramUserId: number,
): Promise<string> {
	const briefing = await getLatestMacroBriefing(db);
	if (!briefing) {
		return NO_MACRO_BRIEFING_MESSAGE;
	}

	const telegramUser = await findTelegramUserById(db, telegramUserId);
	const userDateTimeSettings = telegramUser
		? {
				locale: telegramUser.settings.locale,
				timezone: telegramUser.settings.timezone,
			}
		: { locale: null, timezone: null };

	return formatMacroBriefingMessage(
		{
			content: briefing.content,
			generatedAt: briefing.createdAt,
		},
		userDateTimeSettings,
	);
}

export async function buildMacroBriefingForDecisionMessage(
	db: AppDatabase,
	telegramUserId: number,
	decisionId: number,
): Promise<string | undefined> {
	if (!(await userCanAccessDecision(db, telegramUserId, decisionId))) {
		return undefined;
	}

	const decision = await findDecisionById(db, decisionId);
	if (!decision) {
		return undefined;
	}

	const briefing = await getMacroBriefingAsOf(db, decision.createdAt);
	if (!briefing) {
		return NO_MACRO_FOR_DECISION_MESSAGE;
	}

	const telegramUser = await findTelegramUserById(db, telegramUserId);
	const userDateTimeSettings = telegramUser
		? {
				locale: telegramUser.settings.locale,
				timezone: telegramUser.settings.timezone,
			}
		: { locale: null, timezone: null };

	return formatMacroBriefingMessage(
		{
			content: briefing.content,
			generatedAt: briefing.createdAt,
		},
		userDateTimeSettings,
	);
}
