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
import { parseSettingsCommandArgs } from "@/notifications/telegram/bot/parseSettingsCommand.js";
import { parseStartingValueInput } from "@/notifications/telegram/bot/parseStartingValue.js";
import {
	buildPortfolioModeKeyboard,
	parsePortfolioModeCallback,
} from "@/notifications/telegram/bot/portfolioModeKeyboard.js";
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
	ActivePortfolioContext,
	BotHandlerContext,
	BotHandlerOutput,
	BotIncomingMessage,
} from "@/notifications/telegram/bot/types.js";

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

function promptForRiskTolerance(
	startingValueUsd: number,
	mode: "paper" | "live",
): BotHandlerOutput {
	return {
		text: formatRiskTolerancePrompt(startingValueUsd),
		replyMarkup: buildRiskToleranceKeyboard(),
		effects: {
			userPatch: {
				onboardingState: "awaiting_risk_tolerance",
				onboardingDraftJson: serializeOnboardingDraft({
					mode,
					startingValueUsd,
				}),
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
): BotHandlerOutput {
	if (message.kind === "callback") {
		const defaultValueUsd = parseStartingValueCallback(message.data);
		if (defaultValueUsd !== undefined) {
			return promptForRiskTolerance(defaultValueUsd, "paper");
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

	return promptForRiskTolerance(parsed.valueUsd, "paper");
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
		return draft?.mode === "live"
			? { text: formatLiveDepositReminderMessage() }
			: promptForStartingValue();
	}

	if (draft?.mode === "live") {
		return { text: formatLiveDepositReminderMessage() };
	}

	return completePaperOnboarding(startingValueUsd, riskTolerance);
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
		return handleAwaitingStartingValue(message);
	}

	if (context.onboardingState === "awaiting_live_deposit") {
		return handleAwaitingLiveDeposit(message, context.activePortfolio);
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
