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
import { parseSettingsCommandArgs } from "@/notifications/telegram/bot/parseSettingsCommand.js";
import { parseStartingValueInput } from "@/notifications/telegram/bot/parseStartingValue.js";
import {
	buildRiskToleranceKeyboard,
	parseRiskToleranceCallback,
} from "@/notifications/telegram/bot/riskToleranceKeyboard.js";
import {
	buildSettingsKeyboard,
	parseSettingCallback,
} from "@/notifications/telegram/bot/settingsKeyboard.js";
import {
	formatSettingsMessage,
	formatSettingsUpdatedMessage,
} from "@/notifications/telegram/bot/settingsMessages.js";
import {
	buildStartingValueKeyboard,
	parseStartingValueCallback,
} from "@/notifications/telegram/bot/startingValueKeyboard.js";
import type {
	BotHandlerContext,
	BotHandlerOutput,
	BotIncomingMessage,
} from "@/notifications/telegram/bot/types.js";

function beginOnboarding(): BotHandlerOutput {
	return {
		text: formatStartingValuePrompt(),
		replyMarkup: buildStartingValueKeyboard(),
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
		replyMarkup: buildStartingValueKeyboard(),
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
	if (message.kind === "callback") {
		const defaultValueUsd = parseStartingValueCallback(message.data);
		if (defaultValueUsd !== undefined) {
			return promptForRiskTolerance(defaultValueUsd);
		}

		return {
			text: formatStartingValueReminderMessage(),
			replyMarkup: buildStartingValueKeyboard(),
		};
	}

	if (message.kind !== "text") {
		return {
			text: formatStartingValueReminderMessage(),
			replyMarkup: buildStartingValueKeyboard(),
		};
	}

	const parsed = parseStartingValueInput(message.text);
	if (!parsed.ok) {
		return {
			text: formatInvalidStartingValueMessage(),
			replyMarkup: buildStartingValueKeyboard(),
		};
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

function handleSettingsCommand(
	settings: BotHandlerContext["settings"],
	args: string | undefined,
): BotHandlerOutput {
	const parsed = parseSettingsCommandArgs(args);
	if (parsed.kind === "error") {
		return { text: parsed.message };
	}

	if (parsed.kind === "set") {
		const nextSettings = { ...settings, ...parsed.patch };
		const updatedKey = Object.keys(
			parsed.patch,
		)[0] as keyof typeof parsed.patch;
		const updatedValue = parsed.patch[updatedKey];
		if (updatedKey === undefined || updatedValue === undefined) {
			return {
				text: formatSettingsMessage(nextSettings),
				replyMarkup: buildSettingsKeyboard(nextSettings),
			};
		}

		return {
			text: formatSettingsUpdatedMessage(updatedKey, updatedValue),
			replyMarkup: buildSettingsKeyboard(nextSettings),
			effects: { settingsPatch: parsed.patch },
		};
	}

	return {
		text: formatSettingsMessage(settings),
		replyMarkup: buildSettingsKeyboard(settings),
	};
}

function handleSettingCallback(
	settings: BotHandlerContext["settings"],
	data: string,
): BotHandlerOutput {
	const parsed = parseSettingCallback(data);
	if (!parsed) {
		return {
			text: formatSettingsMessage(settings),
			replyMarkup: buildSettingsKeyboard(settings),
		};
	}

	const nextSettings = { ...settings, [parsed.key]: parsed.value };
	return {
		text: formatSettingsUpdatedMessage(parsed.key, parsed.value),
		replyMarkup: buildSettingsKeyboard(nextSettings),
		effects: { settingsPatch: { [parsed.key]: parsed.value } },
	};
}

export function handleBotMessage(
	context: BotHandlerContext,
	message: BotIncomingMessage,
	summary?: PortfolioSummaryInput,
): BotHandlerOutput {
	if (message.kind === "callback") {
		const settingCallback = parseSettingCallback(message.data);
		if (settingCallback) {
			return handleSettingCallback(context.settings, message.data);
		}
	}

	if (message.kind === "command") {
		switch (message.command) {
			case "settings":
				return handleSettingsCommand(context.settings, message.args);

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
