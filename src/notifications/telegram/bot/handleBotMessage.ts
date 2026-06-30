import type { PortfolioSummaryInput } from "@/notifications/telegram/bot/formatPortfolioSummary.js";
import { formatPortfolioSummary } from "@/notifications/telegram/bot/formatPortfolioSummary.js";
import {
	parseOnboardingDraft,
	serializeOnboardingDraft,
} from "@/notifications/telegram/bot/onboardingDraft.js";
import {
	formatInvalidStartingValueMessage,
	formatPortfolioCreatedMessage,
	formatRiskTolerancePrompt,
	formatRiskToleranceReminderMessage,
	formatSendStartMessage,
	formatStartingValuePrompt,
	formatStartingValueReminderMessage,
	formatUnknownCommandMessage,
	formatUnknownRiskSelectionMessage,
	NO_ACTIVE_PORTFOLIO_MESSAGE,
} from "@/notifications/telegram/bot/onboardingMessages.js";
import { parseStartingValueInput } from "@/notifications/telegram/bot/parseStartingValue.js";
import {
	buildRiskToleranceKeyboard,
	parseRiskToleranceCallback,
} from "@/notifications/telegram/bot/riskToleranceKeyboard.js";
import type {
	BotHandlerContext,
	BotHandlerOutput,
	BotIncomingMessage,
} from "@/notifications/telegram/bot/types.js";

function beginOnboarding(): BotHandlerOutput {
	return {
		text: formatStartingValuePrompt(),
		effects: {
			userPatch: {
				onboardingState: "awaiting_starting_value",
				onboardingDraftJson: null,
			},
			deactivatePortfolios: true,
		},
	};
}

function promptForStartingValue(): BotHandlerOutput {
	return {
		text: formatStartingValuePrompt(),
		effects: {
			userPatch: {
				onboardingState: "awaiting_starting_value",
			},
		},
	};
}

function promptForRiskTolerance(startingValueUsd: number): BotHandlerOutput {
	return {
		text: formatRiskTolerancePrompt(startingValueUsd),
		replyMarkup: buildRiskToleranceKeyboard(),
		effects: {
			userPatch: {
				onboardingState: "awaiting_risk_tolerance",
				onboardingDraftJson: serializeOnboardingDraft({ startingValueUsd }),
			},
		},
	};
}

function completeOnboarding(
	startingValueUsd: number,
	riskTolerance: NonNullable<ReturnType<typeof parseRiskToleranceCallback>>,
): BotHandlerOutput {
	return {
		text: formatPortfolioCreatedMessage(startingValueUsd, riskTolerance),
		effects: {
			userPatch: {
				onboardingState: null,
				onboardingDraftJson: null,
			},
			createPortfolio: {
				startingValueUsd,
				riskTolerance,
			},
		},
	};
}

function formatSummaryReply(
	summary: PortfolioSummaryInput,
	includeResetHint: boolean,
): BotHandlerOutput {
	return {
		text: formatPortfolioSummary(summary, { includeResetHint }),
	};
}

function handleAwaitingStartingValue(
	message: BotIncomingMessage,
): BotHandlerOutput {
	let text: string | undefined;

	if (message.kind === "text") {
		text = message.text;
	} else if (message.kind === "command" && message.command === "default") {
		text = "/default";
	}

	if (!text) {
		return {
			text: formatStartingValueReminderMessage(),
		};
	}

	const parsed = parseStartingValueInput(text);
	if (!parsed.ok) {
		return { text: formatInvalidStartingValueMessage() };
	}

	return promptForRiskTolerance(parsed.valueUsd);
}

function handleAwaitingRiskTolerance(
	message: BotIncomingMessage,
	draftJson: string | null,
): BotHandlerOutput {
	if (message.kind !== "callback") {
		return {
			text: formatRiskToleranceReminderMessage(),
			replyMarkup: buildRiskToleranceKeyboard(),
		};
	}

	const riskTolerance = parseRiskToleranceCallback(message.data);
	if (!riskTolerance) {
		return {
			text: formatUnknownRiskSelectionMessage(),
			replyMarkup: buildRiskToleranceKeyboard(),
		};
	}

	const draft = parseOnboardingDraft(draftJson);
	const startingValueUsd = draft?.startingValueUsd;
	if (startingValueUsd === undefined || startingValueUsd <= 0) {
		return promptForStartingValue();
	}

	return completeOnboarding(startingValueUsd, riskTolerance);
}

export function handleBotMessage(
	context: BotHandlerContext,
	message: BotIncomingMessage,
	summary?: PortfolioSummaryInput,
): BotHandlerOutput {
	if (message.kind === "command") {
		switch (message.command) {
			case "reset":
				return beginOnboarding();

			case "status":
			case "summary":
				if (!context.hasActivePortfolio || !summary) {
					return { text: NO_ACTIVE_PORTFOLIO_MESSAGE };
				}
				return formatSummaryReply(summary, false);

			case "start": {
				if (
					context.onboardingState === null &&
					context.hasActivePortfolio &&
					summary
				) {
					return formatSummaryReply(summary, true);
				}
				if (context.onboardingState === null && !context.hasActivePortfolio) {
					return beginOnboarding();
				}
				const draft = parseOnboardingDraft(context.onboardingDraftJson);
				const startingValueUsd = draft?.startingValueUsd;
				if (
					context.onboardingState === "awaiting_starting_value" ||
					!startingValueUsd
				) {
					return promptForStartingValue();
				}
				if (context.onboardingState === "awaiting_risk_tolerance") {
					return {
						text: formatRiskTolerancePrompt(startingValueUsd ?? 0),
						replyMarkup: buildRiskToleranceKeyboard(),
					};
				}
				return beginOnboarding();
			}

			case "default":
				if (context.onboardingState === "awaiting_starting_value") {
					return handleAwaitingStartingValue(message);
				}
				return { text: NO_ACTIVE_PORTFOLIO_MESSAGE };
		}
	}

	if (context.onboardingState === "awaiting_starting_value") {
		return handleAwaitingStartingValue(message);
	}

	if (context.onboardingState === "awaiting_risk_tolerance") {
		return handleAwaitingRiskTolerance(message, context.onboardingDraftJson);
	}

	if (context.hasActivePortfolio && summary) {
		return {
			text: formatUnknownCommandMessage(),
		};
	}

	return {
		text: formatSendStartMessage(),
	};
}
