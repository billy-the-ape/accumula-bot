import type { RiskTolerance } from "@/risk/riskTolerance.js";
import type { OnboardingState } from "@/storage/repositories/telegramUserRepository.js";
import type { TelegramUserSettings } from "@/storage/telegramUserSettings.js";

export type BotCommand =
	| "start"
	| "status"
	| "summary"
	| "reset"
	| "settings"
	| "decision";

export type TelegramInlineKeyboard = {
	inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

export type OnboardingDraft = {
	startingValueUsd?: number;
};

export type BotUserPatch = {
	onboardingState?: OnboardingState | null;
	onboardingDraftJson?: string | null;
};

export type BotEffects = {
	userPatch?: BotUserPatch;
	settingsPatch?: Partial<TelegramUserSettings>;
	deactivatePortfolios?: boolean;
	createPortfolio?: {
		startingValueUsd: number;
		riskTolerance: RiskTolerance;
	};
};

export type BotHandlerOutput = {
	text: string;
	replyMarkup?: TelegramInlineKeyboard;
	effects?: BotEffects;
};

export type BotIncomingMessage =
	| { kind: "command"; command: BotCommand; args?: string }
	| { kind: "text"; text: string }
	| { kind: "callback"; data: string };

export type BotHandlerContext = {
	onboardingState: OnboardingState | null;
	onboardingDraftJson: string | null;
	hasActivePortfolio: boolean;
	settings: TelegramUserSettings;
};
