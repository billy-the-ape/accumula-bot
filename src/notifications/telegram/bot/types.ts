import type { PortfolioMode } from "@/live/portfolioMode.js";
import type {
	PortfolioRiskSetting,
	RiskTolerance,
} from "@/risk/riskTolerance.js";
import type { OnboardingState } from "@/storage/repositories/telegramUserRepository.js";
import type { TelegramUserSettings } from "@/storage/telegramUserSettings.js";

export type BotCommand =
	| "start"
	| "status"
	| "summary"
	| "reset"
	| "liquidate"
	| "settings"
	| "decision"
	| "portfolio";

export type TelegramInlineKeyboardButton = {
	text: string;
	callback_data: string;
	style?: "danger" | "primary" | "success";
};

export type TelegramInlineKeyboard = {
	inline_keyboard: Array<Array<TelegramInlineKeyboardButton>>;
};

export type OnboardingDraft = {
	mode?: PortfolioMode;
	startingValueUsd?: number;
	liquidateDestinationAddress?: string;
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
	createLivePortfolio?: true;
	executeLiquidation?: {
		portfolioId: number;
		destinationAddress: `0x${string}`;
	};
	portfolioPatch?: {
		portfolioId: number;
		riskSetting: PortfolioRiskSetting;
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

export type ActivePortfolioContext = {
	id: number;
	mode: "paper" | "live";
	fundingStatus: "awaiting_deposit" | "funded" | "paused" | null;
	walletAddress: string | null;
	minDepositUsd: number;
	totalDepositedUsd: number;
	totalWithdrawnUsd: number;
	onChainUsdc?: number;
};

export type BotHandlerContext = {
	onboardingState: OnboardingState | null;
	onboardingDraftJson: string | null;
	hasActivePortfolio: boolean;
	settings: TelegramUserSettings;
	activePortfolio?: ActivePortfolioContext;
};
