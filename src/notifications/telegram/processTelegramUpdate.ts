import type { AppConfig } from "@/config/appConfigSchema.js";
import { assertSupportedDepositChainId } from "@/config/chainAssets.js";
import {
	computePortfolioAccumulateValue,
	getTotalPortfolioQuoteValue,
} from "@/domain/index.js";
import { buildPriceMap } from "@/execution/priceMap.js";
import {
	executeLiquidation,
	isLiquidationConfigured,
} from "@/live/executeLiquidation.js";
import { generatePortfolioWallet } from "@/live/generatePortfolioWallet.js";
import { startLiveDepositPolling } from "@/live/liveDepositPoller.js";
import { isLiveDepositWindowOpen } from "@/live/liveDepositWindow.js";
import { isSmartAccountLiveEnabled } from "@/live/portfolioWalletCredentials.js";
import type { PortfolioWalletKind } from "@/live/portfolioWalletKind.js";
import { createCoinbaseSmartAccountAddress } from "@/live/smartAccount/createCoinbaseSmartAccount.js";
import { syncLivePortfolioDeposit } from "@/live/syncLiveDeposit.js";
import {
	encryptPrivateKey,
	parseWalletEncryptionKey,
} from "@/live/walletEncryption.js";
import { parseDecisionCallback } from "@/notifications/telegram/bot/decisionReportKeyboard.js";
import type { PortfolioSummaryInput } from "@/notifications/telegram/bot/formatPortfolioSummary.js";
import { handleBotMessage } from "@/notifications/telegram/bot/handleBotMessage.js";
import {
	formatLiquidationFailedMessage,
	formatLiquidationSuccessMessage,
} from "@/notifications/telegram/bot/liquidationMessages.js";
import {
	formatLiveDepositExpiredMessage,
	formatLiveDepositInstructions,
	formatLiveDepositStatus,
	formatLiveDepositUnderMinimumMessage,
} from "@/notifications/telegram/bot/onboardingMessages.js";
import { parseDecisionCommandArgs } from "@/notifications/telegram/bot/parseDecisionCommand.js";
import type { ParsedTelegramEvent } from "@/notifications/telegram/bot/parseTelegramUpdate.js";
import { DECISION_NOT_FOUND_MESSAGE } from "@/notifications/telegram/bot/settingsMessages.js";
import type {
	ActivePortfolioContext,
	BotHandlerOutput,
} from "@/notifications/telegram/bot/types.js";
import { buildDecisionReportForUser } from "@/notifications/telegram/buildDecisionReport.js";
import {
	type BuildPortfolioSummaryInputOptions,
	buildPortfolioSummaryInput,
	fetchMarketSnapshotsForConfig,
} from "@/notifications/telegram/buildPortfolioSummaryInput.js";
import {
	acknowledgeCallbackQuery,
	sendBotReply,
} from "@/notifications/telegram/telegramPolling.js";
import type { AppDatabase } from "@/storage/db.js";
import {
	createLivePortfolioAwaitingDeposit,
	createUserPortfolio,
	deactivateUserPortfolios,
	getActivePortfolioForUser,
	revertLivePortfolioAwaitingDeposit,
	type StoredPortfolio,
	updatePortfolioRiskTolerance,
} from "@/storage/repositories/portfolioRepository.js";
import {
	getOrCreateTelegramUser,
	updateTelegramUserOnboarding,
	updateTelegramUserSettings,
} from "@/storage/repositories/telegramUserRepository.js";

export type ProcessTelegramUpdateDeps = BuildPortfolioSummaryInputOptions & {
	sendReply?: typeof sendBotReply;
	acknowledgeCallback?: typeof acknowledgeCallbackQuery;
};

function requireBotToken(config: AppConfig): string {
	const botToken = config.telegram?.botToken;
	if (!botToken) {
		throw new Error("TELEGRAM_BOT_TOKEN is required");
	}

	return botToken;
}

function toActivePortfolioContext(
	portfolio: StoredPortfolio,
	onChainUsdc?: number,
): ActivePortfolioContext {
	return {
		id: portfolio.id,
		mode: portfolio.mode,
		fundingStatus: portfolio.fundingStatus,
		walletAddress: portfolio.walletAddress,
		minDepositUsd: portfolio.minDepositUsd ?? 0,
		totalDepositedUsd: portfolio.totalDepositedUsd,
		totalWithdrawnUsd: portfolio.totalWithdrawnUsd,
		...(onChainUsdc !== undefined ? { onChainUsdc } : {}),
	};
}

function shouldSyncLiveDeposit(
	portfolio: StoredPortfolio | undefined,
): boolean {
	return (
		portfolio?.mode === "live" &&
		portfolio.fundingStatus === "awaiting_deposit" &&
		Boolean(portfolio.walletAddress) &&
		isLiveDepositWindowOpen(portfolio.createdAt)
	);
}

function needsPortfolioSummary(
	incoming: ParsedTelegramEvent["incoming"],
	portfolio: StoredPortfolio | undefined,
	onboardingState: string | null,
): boolean {
	if (
		portfolio?.mode === "live" &&
		portfolio.fundingStatus === "awaiting_deposit"
	) {
		return false;
	}
	if (onboardingState === "awaiting_risk_tolerance") {
		return false;
	}
	if (incoming.kind === "command") {
		return (
			incoming.command === "start" ||
			incoming.command === "status" ||
			incoming.command === "summary" ||
			incoming.command === "portfolio"
		);
	}

	if (incoming.kind === "callback") {
		return (
			incoming.data.startsWith("portfolio_risk:") ||
			incoming.data.startsWith("nav:") ||
			incoming.data.startsWith("setting_menu:") ||
			incoming.data.startsWith("setting:")
		);
	}

	return false;
}

async function applyBotEffects(
	db: AppDatabase,
	config: AppConfig,
	userId: number,
	output: BotHandlerOutput,
	deps: ProcessTelegramUpdateDeps,
): Promise<{
	createdLivePortfolio?: StoredPortfolio;
	liquidationMessage?: string;
}> {
	const effects = output.effects;
	if (!effects) {
		return {};
	}

	if (effects.deactivatePortfolios) {
		await deactivateUserPortfolios(db, userId);
	}

	let createdLivePortfolio: StoredPortfolio | undefined;

	if (effects.createLivePortfolio) {
		const encryptionKey = config.live.walletEncryptionKey;
		if (!encryptionKey) {
			throw new Error("WALLET_ENCRYPTION_KEY is required for live portfolios");
		}

		const wallet = generatePortfolioWallet();
		const key = parseWalletEncryptionKey(encryptionKey);
		const encryptedPrivateKey = encryptPrivateKey(wallet.privateKey, key);

		let walletAddress: `0x${string}` = wallet.address;
		let walletKind: PortfolioWalletKind = "eoa";
		if (isSmartAccountLiveEnabled(config)) {
			const chainId = assertSupportedDepositChainId(config.live.depositChainId);
			walletAddress = await createCoinbaseSmartAccountAddress({
				ownerPrivateKey: wallet.privateKey,
				chainId,
				rpcUrl: config.live.depositRpcUrl,
			});
			walletKind = "smart_account";
		}

		createdLivePortfolio = await createLivePortfolioAwaitingDeposit(db, {
			telegramUserId: userId,
			assetToAccumulate: config.assetToAccumulate.symbol,
			cashSymbol: config.assetStarting.symbol,
			walletAddress,
			walletKind,
			encryptedPrivateKey,
			chainId: config.live.depositChainId,
			minDepositUsd: config.live.minDepositUsd,
		});
	}

	if (effects.createPortfolio) {
		const marketData = await fetchMarketSnapshotsForConfig(config, deps);
		const prices = buildPriceMap(marketData, config.assetStarting.symbol, {
			accumulateSymbol: config.assetToAccumulate.symbol,
		});
		const cashSymbol = config.assetStarting.symbol;
		const { startingValueUsd, riskTolerance } = effects.createPortfolio;
		const initialHoldings = { [cashSymbol]: startingValueUsd };

		await createUserPortfolio(db, {
			telegramUserId: userId,
			assetToAccumulate: config.assetToAccumulate.symbol,
			cashSymbol,
			initialHoldings,
			initialBtcBaseline: computePortfolioAccumulateValue(
				initialHoldings,
				prices,
				config.assetToAccumulate.symbol,
			),
			initialQuoteBaseline: getTotalPortfolioQuoteValue(
				initialHoldings,
				prices,
			),
			riskTolerance,
		});
	}

	if (effects.userPatch) {
		await updateTelegramUserOnboarding(db, userId, effects.userPatch);
	}

	if (effects.settingsPatch) {
		await updateTelegramUserSettings(db, userId, effects.settingsPatch);
	}

	if (effects.portfolioPatch) {
		await updatePortfolioRiskTolerance(
			db,
			effects.portfolioPatch.portfolioId,
			effects.portfolioPatch.riskSetting,
		);
	}

	if (effects.executeLiquidation) {
		try {
			const result = await executeLiquidation(
				db,
				config,
				effects.executeLiquidation,
				deps.fetchImpl,
			);
			return {
				...(createdLivePortfolio ? { createdLivePortfolio } : {}),
				liquidationMessage: formatLiquidationSuccessMessage({
					netToUserUsd: result.netToUserUsd,
					feeUsd: result.feeUsd,
					netTxHash: result.netTxHash,
					...(result.feeTxHash ? { feeTxHash: result.feeTxHash } : {}),
					swapCount: result.swapTxHashes.length,
				}),
			};
		} catch (error: unknown) {
			const message =
				error instanceof Error ? error.message : "Unknown liquidation error";
			return {
				...(createdLivePortfolio ? { createdLivePortfolio } : {}),
				liquidationMessage: formatLiquidationFailedMessage(message),
			};
		}
	}

	return createdLivePortfolio ? { createdLivePortfolio } : {};
}

async function resolveDecisionCommandOutput(
	db: AppDatabase,
	config: AppConfig,
	userId: number,
	args: string | undefined,
): Promise<BotHandlerOutput> {
	const parsed = parseDecisionCommandArgs(args);
	if (parsed.kind === "error") {
		return { text: parsed.message };
	}

	const target =
		parsed.kind === "last"
			? { kind: "last" as const }
			: { kind: "id" as const, id: parsed.id };
	const report = await buildDecisionReportForUser(db, config, userId, target);
	if (!report) {
		return { text: DECISION_NOT_FOUND_MESSAGE };
	}

	return { text: report };
}

async function handleExpiredLiveDeposit(
	db: AppDatabase,
	userId: number,
	portfolio: StoredPortfolio,
): Promise<void> {
	await revertLivePortfolioAwaitingDeposit(db, portfolio.id);
	await updateTelegramUserOnboarding(db, userId, {
		onboardingState: null,
		onboardingDraftJson: null,
	});
}

export async function processTelegramUpdate(
	db: AppDatabase,
	config: AppConfig,
	event: ParsedTelegramEvent,
	deps: ProcessTelegramUpdateDeps = {},
): Promise<void> {
	const botToken = requireBotToken(config);
	const sendReply = deps.sendReply ?? sendBotReply;
	const acknowledgeCallback =
		deps.acknowledgeCallback ?? acknowledgeCallbackQuery;

	const user = await getOrCreateTelegramUser(db, event.chatId, event.from);
	let activePortfolio = await getActivePortfolioForUser(db, user.id);
	let onChainUsdc: number | undefined;
	let depositStatus: "none" | "under_minimum" | "funded" | undefined;
	let onboardingState = user.onboardingState;
	const onboardingDraftJson = user.onboardingDraftJson;

	if (
		activePortfolio?.mode === "live" &&
		activePortfolio.fundingStatus === "awaiting_deposit" &&
		!isLiveDepositWindowOpen(activePortfolio.createdAt)
	) {
		await handleExpiredLiveDeposit(db, user.id, activePortfolio);
		activePortfolio = undefined;
		onboardingState = null;
	}

	if (shouldSyncLiveDeposit(activePortfolio)) {
		const syncResult = await syncLivePortfolioDeposit(
			db,
			config,
			activePortfolio?.id ?? 0,
			...(deps.fetchImpl
				? [{ fetchImpl: deps.fetchImpl, dryRun: true }]
				: [{ dryRun: true }]),
		);
		if (syncResult) {
			onChainUsdc = syncResult.onChainUsdc;
			depositStatus = syncResult.depositStatus;
			activePortfolio = syncResult.portfolio;
		}
	}

	const activePortfolioContext = activePortfolio
		? toActivePortfolioContext(activePortfolio, onChainUsdc)
		: undefined;

	let output: BotHandlerOutput;
	if (
		event.incoming.kind === "callback" &&
		parseDecisionCallback(event.incoming.data) !== undefined
	) {
		const decisionId = parseDecisionCallback(event.incoming.data);
		output = await resolveDecisionCommandOutput(
			db,
			config,
			user.id,
			decisionId !== undefined ? String(decisionId) : undefined,
		);
	} else if (
		event.incoming.kind === "command" &&
		event.incoming.command === "decision"
	) {
		output = await resolveDecisionCommandOutput(
			db,
			config,
			user.id,
			event.incoming.args,
		);
	} else {
		let summary: PortfolioSummaryInput | undefined;
		if (
			activePortfolio &&
			needsPortfolioSummary(event.incoming, activePortfolio, onboardingState)
		) {
			summary = await buildPortfolioSummaryInput(config, activePortfolio, deps);
		}

		output = handleBotMessage(
			{
				onboardingState,
				onboardingDraftJson,
				hasActivePortfolio: activePortfolio !== undefined,
				settings: user.settings,
				...(activePortfolioContext
					? { activePortfolio: activePortfolioContext }
					: {}),
			},
			event.incoming,
			summary,
			{
				liveTradingConfigured: Boolean(config.live.walletEncryptionKey),
				liquidationConfigured: isLiquidationConfigured(config),
				profitFeeBps: config.withdrawal.profitFeeBps,
			},
		);
	}

	const effectResult = await applyBotEffects(db, config, user.id, output, deps);
	const createdLivePortfolio = effectResult.createdLivePortfolio;
	if (effectResult.liquidationMessage) {
		output = { ...output, text: effectResult.liquidationMessage };
	}

	if (createdLivePortfolio?.walletAddress) {
		const minDeposit =
			createdLivePortfolio.minDepositUsd ?? config.live.minDepositUsd;
		output = {
			...output,
			text: formatLiveDepositInstructions(
				createdLivePortfolio.walletAddress,
				minDeposit,
			),
		};

		startLiveDepositPolling({
			db,
			config,
			portfolioId: createdLivePortfolio.id,
			telegramUserId: user.id,
			chatId: event.chatId,
			...(deps.sendReply ? { sendReply: deps.sendReply } : {}),
			...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
		});
	} else if (
		activePortfolio?.walletAddress &&
		activePortfolio.fundingStatus === "awaiting_deposit" &&
		onboardingState === "awaiting_live_deposit"
	) {
		const minDeposit =
			activePortfolio.minDepositUsd ?? config.live.minDepositUsd;
		if (depositStatus === "under_minimum" && onChainUsdc !== undefined) {
			output = {
				text: formatLiveDepositUnderMinimumMessage(onChainUsdc, minDeposit),
			};
		} else {
			output = {
				text: formatLiveDepositStatus(
					activePortfolio.walletAddress,
					minDeposit,
					onChainUsdc ?? 0,
				),
			};
		}
	} else if (
		activePortfolio === undefined &&
		user.onboardingState === "awaiting_live_deposit" &&
		event.incoming.kind === "command"
	) {
		output = { text: formatLiveDepositExpiredMessage() };
	}

	if (event.callbackQueryId) {
		await acknowledgeCallback({
			botToken,
			callbackQueryId: event.callbackQueryId,
			...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
		});
	}

	await sendReply({
		botToken,
		chatId: event.chatId,
		text: output.text,
		...(output.replyMarkup ? { replyMarkup: output.replyMarkup } : {}),
		...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
	});
}
