import type { AppConfig } from "@/config/appConfigSchema.js";
import { computePortfolioAccumulateValue } from "@/domain/index.js";
import { buildPriceMap } from "@/execution/priceMap.js";
import {
	type BuildPortfolioSummaryInputOptions,
	fetchMarketSnapshotsForConfig,
} from "@/notifications/telegram/buildPortfolioSummaryInput.js";
import type { AppDatabase } from "@/storage/db.js";
import {
	finalizeLivePortfolioRisk,
	type StoredPortfolio,
} from "@/storage/repositories/portfolioRepository.js";
import { updateTelegramUserOnboarding } from "@/storage/repositories/telegramUserRepository.js";

export type CompleteLiveDepositDeps = BuildPortfolioSummaryInputOptions;

/** Activates a funded live portfolio with default medium risk tolerance. */
export async function completeLiveDeposit(
	db: AppDatabase,
	config: AppConfig,
	portfolio: StoredPortfolio,
	depositUsd: number,
	telegramUserId: number,
	deps: CompleteLiveDepositDeps = {},
): Promise<StoredPortfolio> {
	const marketData = await fetchMarketSnapshotsForConfig(config, deps);
	const prices = buildPriceMap(marketData, config.assetStarting.symbol, {
		accumulateSymbol: config.assetToAccumulate.symbol,
	});
	const cashSymbol = config.assetStarting.symbol;
	const initialHoldings = { [cashSymbol]: depositUsd };

	const updated = await finalizeLivePortfolioRisk(
		db,
		portfolio.id,
		"medium",
		computePortfolioAccumulateValue(
			initialHoldings,
			prices,
			config.assetToAccumulate.symbol,
		),
	);

	await updateTelegramUserOnboarding(db, telegramUserId, {
		onboardingState: null,
		onboardingDraftJson: null,
	});

	return updated;
}
