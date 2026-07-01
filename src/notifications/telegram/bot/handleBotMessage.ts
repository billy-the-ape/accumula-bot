import { computeLiquidationBreakdown } from "@/live/computeLiquidationBreakdown.js";
import {
	isSameWalletAddress,
	parseDestinationWalletAddress,
} from "@/live/validateWalletAddress.js";
import type { PortfolioSummaryInput } from "@/notifications/telegram/bot/formatPortfolioSummary.js";
import { formatPortfolioSummary } from "@/notifications/telegram/bot/formatPortfolioSummary.js";
import {
	buildLiquidationConfirmKeyboard,
	parseLiquidationCallback,
} from "@/notifications/telegram/bot/liquidationKeyboard.js";
import {
	formatInvalidLiquidationAddressMessage,
	formatLiquidationAddressPrompt,
	formatLiquidationCancelledMessage,
	formatLiquidationInProgressMessage,
	formatLiquidationSameWalletMessage,
	formatLiquidationSummaryMessage,
	formatLiveResetRejectedMessage,
	formatMissingTreasuryAddressMessage,
} from "@/notifications/telegram/bot/liquidationMessages.js";
import {
	parseOnboardingDraft,
	serializeOnboardingDraft,
} from "@/notifications/telegram/bot/onboardingDraft.js";
import {
	botPlainText,
	formatInvalidStartingValueMessage,
	formatLiveDepositReminderMessage,
	formatLiveDepositStatus,
	formatMissingWalletEncryptionKeyMessage,
	formatPortfolioCreatedMessage,
	formatPortfolioModePrompt,
	formatPortfolioModeReminderMessage,
	formatPortfolioResetMessage,
	formatRiskTolerancePrompt,
	formatRiskToleranceReminderMessage,
	formatSendStartMessage,
	formatStartingValuePrompt,
	formatStartingValueReminderMessage,
	formatUnknownCommandMessage,
	formatUnknownRiskSelectionMessage,
	NO_ACTIVE_PORTFOLIO_MESSAGE,
} from "@/notifications/telegram/bot/onboardingMessages.js";
import { parsePortfolioCommandArgs } from "@/notifications/telegram/bot/parsePortfolioCommand.js";
import {
	parseSettingsCommandArgs,
	parseSettingsTextInput,
} from "@/notifications/telegram/bot/parseSettingsCommand.js";
import { parseStartingValueInput } from "@/notifications/telegram/bot/parseStartingValue.js";
import {
	buildPortfolioModeKeyboard,
	parsePortfolioModeCallback,
} from "@/notifications/telegram/bot/portfolioModeKeyboard.js";
import {
	buildPortfolioRiskKeyboard,
	parsePortfolioRiskCallback,
} from "@/notifications/telegram/bot/portfolioRiskKeyboard.js";
import {
	formatPortfolioRiskPromptMessage,
	formatPortfolioRiskUpdatedMessage,
	formatPortfolioSettingsMessage,
	NO_ACTIVE_PORTFOLIO_FOR_PORTFOLIO_COMMAND,
} from "@/notifications/telegram/bot/portfolioSettingsMessages.js";
import {
	buildRiskToleranceKeyboard,
	parseRiskToleranceCallback,
} from "@/notifications/telegram/bot/riskToleranceKeyboard.js";
import {
	buildDefaultRiskKeyboard,
	buildLocaleKeyboard,
	buildSettingsKeyboard,
	buildTimezoneKeyboard,
	parseSettingCallback,
	parseSettingMenuCallback,
} from "@/notifications/telegram/bot/settingsKeyboard.js";
import {
	formatLocalePromptMessage,
	formatSettingsMessage,
	formatSettingsUpdatedMessage,
	formatTimezonePromptMessage,
} from "@/notifications/telegram/bot/settingsMessages.js";
import {
	buildStartingValueKeyboard,
	parseStartingValueCallback,
} from "@/notifications/telegram/bot/startingValueKeyboard.js";
import {
	buildStatusNavKeyboard,
	parseNavCallback,
} from "@/notifications/telegram/bot/statusNavKeyboard.js";
import type {
	ActivePortfolioContext,
	BotHandlerContext,
	BotHandlerOutput,
	BotIncomingMessage,
} from "@/notifications/telegram/bot/types.js";
import type { RiskTolerance } from "@/risk/riskTolerance.js";

function beginOnboarding(): BotHandlerOutput {
	return {
		text: formatPortfolioModePrompt(),
		replyMarkup: buildPortfolioModeKeyboard(),
		effects: {
			userPatch: {
				onboardingState: "awaiting_mode_selection",
				onboardingDraftJson: null,
			},
		},
	};
}

function handleReset(context: BotHandlerContext): BotHandlerOutput {
	if (context.activePortfolio?.mode === "live") {
		return { text: formatLiveResetRejectedMessage() };
	}

	return {
		text: formatPortfolioResetMessage(),
		effects: {
			userPatch: {
				onboardingState: null,
				onboardingDraftJson: null,
			},
			deactivatePortfolios: true,
		},
	};
}

function beginLiquidation(): BotHandlerOutput {
	return {
		text: formatLiquidationAddressPrompt(),
		effects: {
			userPatch: {
				onboardingState: "awaiting_liquidate_address",
				onboardingDraftJson: null,
			},
		},
	};
}

function isLiveFundedPortfolio(context: BotHandlerContext): boolean {
	return (
		context.activePortfolio?.mode === "live" &&
		context.activePortfolio.fundingStatus === "funded"
	);
}

function promptForModeSelection(): BotHandlerOutput {
	return {
		text: formatPortfolioModePrompt(),
		replyMarkup: buildPortfolioModeKeyboard(),
		effects: {
			userPatch: {
				onboardingState: "awaiting_mode_selection",
			},
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
				onboardingDraftJson: serializeOnboardingDraft({ mode: "paper" }),
			},
		},
	};
}

function completePaperOnboarding(
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
	context: BotHandlerContext,
	includeHint: boolean,
): BotHandlerOutput {
	const isLive = context.activePortfolio?.mode === "live";
	return {
		text: formatPortfolioSummary(summary, {
			includeResetHint: includeHint && !isLive,
			includeLiquidateHint: includeHint && isLive,
		}),
		...(!includeHint
			? {
					replyMarkup: buildStatusNavKeyboard({ isLive: isLive === true }),
				}
			: {}),
	};
}

function handleAwaitingLiquidateAddress(
	message: BotIncomingMessage,
	context: BotHandlerContext,
	summary: PortfolioSummaryInput | undefined,
	profitFeeBps: number,
): BotHandlerOutput {
	if (message.kind !== "text") {
		return { text: formatLiquidationAddressPrompt() };
	}

	const parsed = parseDestinationWalletAddress(message.text);
	if (!parsed.ok) {
		return { text: formatInvalidLiquidationAddressMessage(parsed.reason) };
	}

	const portfolioWallet = context.activePortfolio?.walletAddress;
	if (portfolioWallet && isSameWalletAddress(parsed.address, portfolioWallet)) {
		return { text: formatLiquidationSameWalletMessage() };
	}

	const estimatedGrossUsdc = summary?.currentUsdValue ?? 0;
	const breakdown = computeLiquidationBreakdown({
		totalDepositedUsd: context.activePortfolio?.totalDepositedUsd ?? 0,
		totalWithdrawnUsd: context.activePortfolio?.totalWithdrawnUsd ?? 0,
		grossUsdc: estimatedGrossUsdc,
		profitFeeBps,
	});

	return {
		text: formatLiquidationSummaryMessage({
			destinationAddress: parsed.address,
			estimatedGrossUsdc,
			breakdown,
			profitFeeBps,
		}),
		replyMarkup: buildLiquidationConfirmKeyboard(),
		effects: {
			userPatch: {
				onboardingState: "awaiting_liquidate_confirm",
				onboardingDraftJson: serializeOnboardingDraft({
					liquidateDestinationAddress: parsed.address,
				}),
			},
		},
	};
}

function handleAwaitingLiquidateConfirm(
	message: BotIncomingMessage,
	context: BotHandlerContext,
	profitFeeBps: number,
): BotHandlerOutput {
	if (message.kind !== "callback") {
		const draft = parseOnboardingDraft(context.onboardingDraftJson);
		const destinationAddress = draft?.liquidateDestinationAddress ?? "0x";
		const estimatedGrossUsdc = 0;
		const breakdown = computeLiquidationBreakdown({
			totalDepositedUsd: context.activePortfolio?.totalDepositedUsd ?? 0,
			totalWithdrawnUsd: context.activePortfolio?.totalWithdrawnUsd ?? 0,
			grossUsdc: estimatedGrossUsdc,
			profitFeeBps,
		});

		return {
			text: formatLiquidationSummaryMessage({
				destinationAddress,
				estimatedGrossUsdc,
				breakdown,
				profitFeeBps,
			}),
			replyMarkup: buildLiquidationConfirmKeyboard(),
		};
	}

	const action = parseLiquidationCallback(message.data);
	if (action === "cancel" || action === undefined) {
		return {
			text: formatLiquidationCancelledMessage(),
			effects: {
				userPatch: {
					onboardingState: null,
					onboardingDraftJson: null,
				},
			},
		};
	}

	const draft = parseOnboardingDraft(context.onboardingDraftJson);
	const destinationAddress = draft?.liquidateDestinationAddress;
	const portfolioId = context.activePortfolio?.id;
	if (!destinationAddress || portfolioId === undefined) {
		return {
			text: formatLiquidationCancelledMessage(),
			effects: {
				userPatch: {
					onboardingState: null,
					onboardingDraftJson: null,
				},
			},
		};
	}

	const parsed = parseDestinationWalletAddress(destinationAddress);
	if (!parsed.ok) {
		return beginLiquidation();
	}

	return {
		text: formatLiquidationInProgressMessage(),
		effects: {
			userPatch: {
				onboardingState: null,
				onboardingDraftJson: null,
			},
			executeLiquidation: {
				portfolioId,
				destinationAddress: parsed.address,
			},
		},
	};
}

function handleAwaitingModeSelection(
	message: BotIncomingMessage,
	liveTradingConfigured: boolean,
): BotHandlerOutput {
	if (message.kind !== "callback") {
		return {
			text: formatPortfolioModeReminderMessage(),
			replyMarkup: buildPortfolioModeKeyboard(),
		};
	}

	const mode = parsePortfolioModeCallback(message.data);
	if (!mode) {
		return {
			text: formatPortfolioModeReminderMessage(),
			replyMarkup: buildPortfolioModeKeyboard(),
		};
	}

	if (mode === "paper") {
		return promptForStartingValue();
	}

	if (mode === "live") {
		if (!liveTradingConfigured) {
			return {
				text: formatMissingWalletEncryptionKeyMessage(),
				replyMarkup: buildPortfolioModeKeyboard(),
			};
		}

		return {
			text: botPlainText(["Creating your Base deposit wallet…"]),
			effects: {
				userPatch: {
					onboardingState: "awaiting_live_deposit",
				},
				createLivePortfolio: true,
			},
		};
	}

	return {
		text: formatPortfolioModeReminderMessage(),
		replyMarkup: buildPortfolioModeKeyboard(),
	};
}

function handleAwaitingStartingValue(
	message: BotIncomingMessage,
	defaultRiskTolerance: RiskTolerance,
): BotHandlerOutput {
	if (message.kind === "callback") {
		const defaultValueUsd = parseStartingValueCallback(message.data);
		if (defaultValueUsd !== undefined) {
			return completePaperOnboarding(defaultValueUsd, defaultRiskTolerance);
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

	return completePaperOnboarding(parsed.valueUsd, defaultRiskTolerance);
}

function handleAwaitingLiveDeposit(
	message: BotIncomingMessage,
	activePortfolio: ActivePortfolioContext | undefined,
): BotHandlerOutput {
	if (
		message.kind === "command" &&
		(message.command === "status" || message.command === "start")
	) {
		if (!activePortfolio?.walletAddress) {
			return { text: formatLiveDepositReminderMessage() };
		}

		return {
			text: formatLiveDepositStatus(
				activePortfolio.walletAddress,
				activePortfolio.minDepositUsd,
				activePortfolio.onChainUsdc ?? 0,
			),
		};
	}

	return { text: formatLiveDepositReminderMessage() };
}

function handleAwaitingRiskTolerance(
	message: BotIncomingMessage,
	draftJson: string | null,
	defaultRiskTolerance: RiskTolerance,
): BotHandlerOutput {
	if (message.kind === "callback") {
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
			return draft?.mode === "live"
				? { text: formatLiveDepositReminderMessage() }
				: promptForStartingValue();
		}

		if (draft?.mode === "live") {
			return { text: formatLiveDepositReminderMessage() };
		}

		return completePaperOnboarding(startingValueUsd, riskTolerance);
	}

	const draft = parseOnboardingDraft(draftJson);
	const startingValueUsd = draft?.startingValueUsd;
	if (
		draft?.mode === "paper" &&
		startingValueUsd !== undefined &&
		startingValueUsd > 0
	) {
		return completePaperOnboarding(startingValueUsd, defaultRiskTolerance);
	}

	return {
		text: formatRiskToleranceReminderMessage(),
		replyMarkup: buildRiskToleranceKeyboard(),
	};
}

function settingsPatchFromCallback(
	parsed: NonNullable<ReturnType<typeof parseSettingCallback>>,
): Partial<BotHandlerContext["settings"]> {
	if (parsed.key === "verbose") {
		return { verbose: parsed.value };
	}

	if (parsed.key === "defaultRiskTolerance") {
		return { defaultRiskTolerance: parsed.value as RiskTolerance };
	}

	if (parsed.key === "locale") {
		return { locale: parsed.value };
	}

	return { timezone: parsed.value };
}

function handleSettingsCommand(
	settings: BotHandlerContext["settings"],
	args: string | undefined,
): BotHandlerOutput {
	const parsed = parseSettingsCommandArgs(args);
	if (parsed.kind === "error") {
		return { text: parsed.message };
	}

	if (parsed.kind === "prompt") {
		if (parsed.key === "locale") {
			return {
				text: formatLocalePromptMessage(),
				replyMarkup: buildLocaleKeyboard(settings.locale),
				effects: {
					userPatch: { onboardingState: "awaiting_settings_locale" },
				},
			};
		}

		return {
			text: formatTimezonePromptMessage(),
			replyMarkup: buildTimezoneKeyboard(settings.timezone),
			effects: {
				userPatch: { onboardingState: "awaiting_settings_timezone" },
			},
		};
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
			effects: {
				settingsPatch: parsed.patch,
				userPatch: { onboardingState: null },
			},
		};
	}

	return {
		text: formatSettingsMessage(settings),
		replyMarkup: buildSettingsKeyboard(settings),
	};
}

function handleSettingMenuCallback(
	settings: BotHandlerContext["settings"],
	data: string,
): BotHandlerOutput {
	const menu = parseSettingMenuCallback(data);
	if (menu === "defaultRisk") {
		return {
			text: formatSettingsMessage(settings),
			replyMarkup: buildDefaultRiskKeyboard(settings.defaultRiskTolerance),
		};
	}

	if (menu === "locale") {
		return {
			text: formatLocalePromptMessage(),
			replyMarkup: buildLocaleKeyboard(settings.locale),
			effects: {
				userPatch: { onboardingState: "awaiting_settings_locale" },
			},
		};
	}

	if (menu === "timezone") {
		return {
			text: formatTimezonePromptMessage(),
			replyMarkup: buildTimezoneKeyboard(settings.timezone),
			effects: {
				userPatch: { onboardingState: "awaiting_settings_timezone" },
			},
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

	const patch = settingsPatchFromCallback(parsed);
	const nextSettings = { ...settings, ...patch };
	const updatedKey = Object.keys(patch)[0] as keyof typeof patch;
	const updatedValue = patch[updatedKey];
	if (updatedKey === undefined || updatedValue === undefined) {
		return {
			text: formatSettingsMessage(nextSettings),
			replyMarkup: buildSettingsKeyboard(nextSettings),
		};
	}

	return {
		text: formatSettingsUpdatedMessage(updatedKey, updatedValue),
		replyMarkup: buildSettingsKeyboard(nextSettings),
		effects: {
			settingsPatch: patch,
			userPatch: { onboardingState: null },
		},
	};
}

function handleAwaitingSettingsInput(
	context: BotHandlerContext,
	message: BotIncomingMessage,
): BotHandlerOutput {
	const onboardingState = context.onboardingState;
	if (
		message.kind !== "text" ||
		(onboardingState !== "awaiting_settings_locale" &&
			onboardingState !== "awaiting_settings_timezone")
	) {
		return handleSettingsCommand(context.settings, undefined);
	}

	const parsed = parseSettingsTextInput(onboardingState, message.text);
	if (parsed.kind === "error") {
		return { text: parsed.message };
	}

	if (parsed.kind !== "set") {
		return handleSettingsCommand(context.settings, undefined);
	}

	const nextSettings = { ...context.settings, ...parsed.patch };
	const updatedKey = Object.keys(parsed.patch)[0] as keyof typeof parsed.patch;
	const updatedValue = parsed.patch[updatedKey];
	if (updatedKey === undefined || updatedValue === undefined) {
		return handleSettingsCommand(context.settings, undefined);
	}

	return {
		text: formatSettingsUpdatedMessage(updatedKey, updatedValue),
		replyMarkup: buildSettingsKeyboard(nextSettings),
		effects: {
			settingsPatch: parsed.patch,
			userPatch: { onboardingState: null },
		},
	};
}

function handleNavCallback(
	context: BotHandlerContext,
	summary: PortfolioSummaryInput | undefined,
	nav: "liquidate" | "portfolio" | "settings",
	options: HandleBotMessageOptions,
): BotHandlerOutput {
	switch (nav) {
		case "liquidate":
			if (!isLiveFundedPortfolio(context)) {
				return { text: NO_ACTIVE_PORTFOLIO_MESSAGE };
			}
			if (!options.liquidationConfigured) {
				return { text: formatMissingTreasuryAddressMessage() };
			}
			return beginLiquidation();
		case "portfolio":
			return handlePortfolioCommand(context, summary, undefined);
		case "settings":
			return handleSettingsCommand(context.settings, undefined);
	}
}

function handlePortfolioCommand(
	context: BotHandlerContext,
	summary: PortfolioSummaryInput | undefined,
	args: string | undefined,
): BotHandlerOutput {
	if (!context.hasActivePortfolio || !summary) {
		return { text: NO_ACTIVE_PORTFOLIO_FOR_PORTFOLIO_COMMAND };
	}

	const parsed = parsePortfolioCommandArgs(args);
	if (parsed.kind === "error") {
		return { text: parsed.message };
	}

	if (parsed.kind === "show_risk") {
		return {
			text: formatPortfolioRiskPromptMessage(summary.riskTolerance),
			replyMarkup: buildPortfolioRiskKeyboard(summary.riskTolerance),
		};
	}

	if (parsed.kind === "set") {
		const portfolioId = context.activePortfolio?.id;
		if (portfolioId === undefined) {
			return { text: NO_ACTIVE_PORTFOLIO_FOR_PORTFOLIO_COMMAND };
		}

		return {
			text: formatPortfolioRiskUpdatedMessage(parsed.riskTolerance),
			replyMarkup: buildPortfolioRiskKeyboard(parsed.riskTolerance),
			effects: {
				portfolioPatch: {
					portfolioId,
					riskTolerance: parsed.riskTolerance,
				},
			},
		};
	}

	return {
		text: formatPortfolioSettingsMessage(summary.riskTolerance),
	};
}

function handlePortfolioRiskCallback(
	context: BotHandlerContext,
	summary: PortfolioSummaryInput | undefined,
	data: string,
): BotHandlerOutput {
	if (!context.hasActivePortfolio || !summary) {
		return { text: NO_ACTIVE_PORTFOLIO_FOR_PORTFOLIO_COMMAND };
	}

	const riskTolerance = parsePortfolioRiskCallback(data);
	if (!riskTolerance) {
		return {
			text: formatPortfolioSettingsMessage(summary.riskTolerance),
		};
	}

	return {
		text: formatPortfolioRiskUpdatedMessage(riskTolerance),
		replyMarkup: buildPortfolioRiskKeyboard(riskTolerance),
		effects: {
			portfolioPatch: {
				portfolioId: context.activePortfolio?.id ?? 0,
				riskTolerance,
			},
		},
	};
}

export type HandleBotMessageOptions = {
	liveTradingConfigured?: boolean;
	liquidationConfigured?: boolean;
	profitFeeBps?: number;
};

export function handleBotMessage(
	context: BotHandlerContext,
	message: BotIncomingMessage,
	summary?: PortfolioSummaryInput,
	options: HandleBotMessageOptions = {},
): BotHandlerOutput {
	const liveTradingConfigured = options.liveTradingConfigured ?? false;
	const liquidationConfigured = options.liquidationConfigured ?? false;
	const profitFeeBps = options.profitFeeBps ?? 500;

	if (message.kind === "callback") {
		const liquidationCallback = parseLiquidationCallback(message.data);
		if (
			liquidationCallback &&
			context.onboardingState === "awaiting_liquidate_confirm"
		) {
			return handleAwaitingLiquidateConfirm(message, context, profitFeeBps);
		}

		const settingMenu = parseSettingMenuCallback(message.data);
		if (settingMenu) {
			return handleSettingMenuCallback(context.settings, message.data);
		}

		const settingCallback = parseSettingCallback(message.data);
		if (settingCallback) {
			return handleSettingCallback(context.settings, message.data);
		}

		const navCallback = parseNavCallback(message.data);
		if (navCallback) {
			return handleNavCallback(context, summary, navCallback, {
				liveTradingConfigured,
				liquidationConfigured,
				profitFeeBps,
			});
		}

		const portfolioRiskCallback = parsePortfolioRiskCallback(message.data);
		if (portfolioRiskCallback) {
			return handlePortfolioRiskCallback(context, summary, message.data);
		}
	}

	if (message.kind === "command") {
		switch (message.command) {
			case "settings":
				return handleSettingsCommand(context.settings, message.args);

			case "portfolio":
				return handlePortfolioCommand(context, summary, message.args);

			case "reset":
				return handleReset(context);

			case "liquidate":
				if (!isLiveFundedPortfolio(context)) {
					return { text: NO_ACTIVE_PORTFOLIO_MESSAGE };
				}
				if (!liquidationConfigured) {
					return { text: formatMissingTreasuryAddressMessage() };
				}
				return beginLiquidation();

			case "status":
			case "summary":
				if (
					context.onboardingState === "awaiting_live_deposit" ||
					(context.activePortfolio?.mode === "live" &&
						context.activePortfolio.fundingStatus === "awaiting_deposit")
				) {
					return handleAwaitingLiveDeposit(message, context.activePortfolio);
				}
				if (context.onboardingState === "awaiting_risk_tolerance") {
					const draft = parseOnboardingDraft(context.onboardingDraftJson);
					return {
						text: formatRiskTolerancePrompt(draft?.startingValueUsd ?? 0),
						replyMarkup: buildRiskToleranceKeyboard(),
					};
				}
				if (!context.hasActivePortfolio || !summary) {
					return { text: NO_ACTIVE_PORTFOLIO_MESSAGE };
				}
				return formatSummaryReply(summary, context, false);

			case "start": {
				if (
					context.onboardingState === null &&
					context.hasActivePortfolio &&
					summary &&
					context.activePortfolio?.fundingStatus !== "awaiting_deposit"
				) {
					return formatSummaryReply(summary, context, true);
				}
				if (
					context.activePortfolio?.mode === "live" &&
					context.activePortfolio.fundingStatus === "awaiting_deposit"
				) {
					return handleAwaitingLiveDeposit(message, context.activePortfolio);
				}
				if (context.onboardingState === null && !context.hasActivePortfolio) {
					return beginOnboarding();
				}
				if (context.onboardingState === "awaiting_mode_selection") {
					return promptForModeSelection();
				}
				if (context.onboardingState === "awaiting_starting_value") {
					return promptForStartingValue();
				}
				const draft = parseOnboardingDraft(context.onboardingDraftJson);
				const startingValueUsd = draft?.startingValueUsd;
				if (context.onboardingState === "awaiting_risk_tolerance") {
					return {
						text: formatRiskTolerancePrompt(startingValueUsd ?? 0),
						replyMarkup: buildRiskToleranceKeyboard(),
					};
				}
				if (context.onboardingState === "awaiting_live_deposit") {
					return handleAwaitingLiveDeposit(message, context.activePortfolio);
				}
				return beginOnboarding();
			}
		}
	}

	if (context.onboardingState === "awaiting_liquidate_address") {
		return handleAwaitingLiquidateAddress(
			message,
			context,
			summary,
			profitFeeBps,
		);
	}

	if (context.onboardingState === "awaiting_liquidate_confirm") {
		return handleAwaitingLiquidateConfirm(message, context, profitFeeBps);
	}

	if (context.onboardingState === "awaiting_mode_selection") {
		return handleAwaitingModeSelection(message, liveTradingConfigured);
	}

	if (context.onboardingState === "awaiting_starting_value") {
		return handleAwaitingStartingValue(
			message,
			context.settings.defaultRiskTolerance,
		);
	}

	if (
		context.onboardingState === "awaiting_settings_locale" ||
		context.onboardingState === "awaiting_settings_timezone"
	) {
		return handleAwaitingSettingsInput(context, message);
	}

	if (context.onboardingState === "awaiting_live_deposit") {
		return handleAwaitingLiveDeposit(message, context.activePortfolio);
	}

	if (context.onboardingState === "awaiting_risk_tolerance") {
		return handleAwaitingRiskTolerance(
			message,
			context.onboardingDraftJson,
			context.settings.defaultRiskTolerance,
		);
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
