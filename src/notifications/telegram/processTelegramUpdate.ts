import type { AppConfig } from "@/config/appConfigSchema.js";
import {
	computePortfolioAccumulateValue,
	getTotalPortfolioQuoteValue,
} from "@/domain/index.js";
import { buildPriceMap } from "@/execution/priceMap.js";
import type { PortfolioSummaryInput } from "@/notifications/telegram/bot/formatPortfolioSummary.js";
import { handleBotMessage } from "@/notifications/telegram/bot/handleBotMessage.js";
import { parseDecisionCommandArgs } from "@/notifications/telegram/bot/parseDecisionCommand.js";
import type { ParsedTelegramEvent } from "@/notifications/telegram/bot/parseTelegramUpdate.js";
import { DECISION_NOT_FOUND_MESSAGE } from "@/notifications/telegram/bot/settingsMessages.js";
import type { BotHandlerOutput } from "@/notifications/telegram/bot/types.js";
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
	createUserPortfolio,
	deactivateUserPortfolios,
	getActivePortfolioForUser,
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

function needsPortfolioSummary(
	incoming: ParsedTelegramEvent["incoming"],
): boolean {
	if (incoming.kind === "command") {
		return (
			incoming.command === "start" ||
			incoming.command === "status" ||
			incoming.command === "summary"
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
): Promise<void> {
	const effects = output.effects;
	if (!effects) {
		return;
	}

	if (effects.deactivatePortfolios) {
		await deactivateUserPortfolios(db, userId);
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

	const user = await getOrCreateTelegramUser(db, event.chatId);
	const activePortfolio = await getActivePortfolioForUser(db, user.id);

	let output: BotHandlerOutput;
	if (
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
		if (activePortfolio && needsPortfolioSummary(event.incoming)) {
			summary = await buildPortfolioSummaryInput(config, activePortfolio, deps);
		}

		output = handleBotMessage(
			{
				onboardingState: user.onboardingState,
				onboardingDraftJson: user.onboardingDraftJson,
				hasActivePortfolio: activePortfolio !== undefined,
				settings: user.settings,
			},
			event.incoming,
			summary,
		);
	}

	await applyBotEffects(db, config, user.id, output, deps);

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
