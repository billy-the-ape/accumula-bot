import type { AppConfig } from "@/config/index.js";
import { getTotalPortfolioQuoteValue } from "@/domain/allocation.js";
import { computePortfolioBtcValue } from "@/domain/btcBenchmark.js";
import type { PriceMap } from "@/domain/types.js";
import type { OutlookThresholds } from "@/execution/outlookActions";
import { planTrades } from "@/execution/planTrades.js";
import { buildPriceMap } from "@/execution/priceMap.js";
import { settleFill } from "@/execution/settleFill.js";
import type {
	ExecuteRecommendationInput,
	ExecutionEngine,
	ExecutionResult,
} from "@/execution/types.js";
import { validatePlannedPaperTrades } from "@/execution/validatePlannedTrades.js";
import { DEFAULT_RISK_LIMITS } from "@/risk/riskLimits.js";
import type { StoredTrade } from "@/schemas/Trade.js";
import type { AppDatabase } from "@/storage/db.js";
import {
	getOrCreatePortfolio,
	type StoredPortfolio,
} from "@/storage/repositories/portfolioRepository.js";

export const DEFAULT_PAPER_STARTING_CASH_USD = 10_000;

export type PaperExecutionConfig = {
	assetToAccumulate: string;
	cashSymbol: string;
	tradeableSymbols: readonly string[];
	initialCashUsd: number;
	maxPurchaseFraction?: number;
	maxPositionFraction?: number;
	outlookThresholds: OutlookThresholds;
};

export function createPaperExecutionConfig(
	config: AppConfig,
	overrides: Partial<Pick<PaperExecutionConfig, "initialCashUsd">> = {},
): PaperExecutionConfig {
	return {
		assetToAccumulate: config.assetToAccumulate.symbol,
		cashSymbol: config.assetStarting.symbol,
		tradeableSymbols: config.assetTradeable.map((asset) => asset.symbol),
		initialCashUsd: overrides.initialCashUsd ?? DEFAULT_PAPER_STARTING_CASH_USD,
		outlookThresholds: config.outlookThresholds,
	};
}

export class PaperExecution implements ExecutionEngine {
	constructor(
		private readonly db: AppDatabase,
		private readonly config: PaperExecutionConfig,
	) {}

	async executeRecommendation(
		input: ExecuteRecommendationInput,
	): Promise<ExecutionResult> {
		const maxPurchaseFraction =
			this.config.maxPurchaseFraction ??
			DEFAULT_RISK_LIMITS.maxAllocationPerPurchase;
		const maxPositionFraction =
			this.config.maxPositionFraction ??
			DEFAULT_RISK_LIMITS.maxAllocationPerAsset;

		const prices = buildPriceMap(input.marketSnapshots, this.config.cashSymbol);
		const portfolio = await this.ensurePortfolio(prices);
		const plan = planTrades({
			holdings: portfolio.holdings,
			prices,
			outlooks: input.recommendation.outlooks,
			cashSymbol: this.config.cashSymbol,
			maxPurchaseFraction,
			maxPositionFraction,
			thresholds: this.config.outlookThresholds,
			riskLimits: DEFAULT_RISK_LIMITS,
		});

		if (plan.fills.length === 0) {
			return {
				executed: false,
				reason: plan.holdReason ?? "No trades planned",
				trades: [],
			};
		}

		const risk = validatePlannedPaperTrades({
			recommendation: input.recommendation,
			holdings: portfolio.holdings,
			prices,
			tradingEnabled: portfolio.tradingEnabled,
			dailyBaselineBtcValue: portfolio.dailyBaselineBtcValue,
			weeklyBaselineBtcValue: portfolio.weeklyBaselineBtcValue,
			cashSymbol: this.config.cashSymbol,
			tradeableSymbols: this.config.tradeableSymbols,
			fills: plan.fills,
		});

		if (!risk.allowed) {
			return {
				executed: false,
				reason: risk.violations
					.map((violation) => violation.message)
					.join("; "),
				trades: [],
				riskBlocked: true,
			};
		}

		const trades: StoredTrade[] = [];
		for (const fill of plan.fills) {
			const settled = await settleFill(
				this.db,
				portfolio.id,
				fill,
				this.config.cashSymbol,
				input.decisionId,
			);
			trades.push(...settled);
		}

		return {
			executed: true,
			reason: `Executed ${plan.fills.length} planned fill(s)`,
			trades,
		};
	}

	private async ensurePortfolio(prices: PriceMap): Promise<StoredPortfolio> {
		const initialHoldings = {
			[this.config.cashSymbol]: this.config.initialCashUsd,
		};

		return getOrCreatePortfolio(this.db, {
			assetToAccumulate: this.config.assetToAccumulate,
			cashSymbol: this.config.cashSymbol,
			initialHoldings,
			initialBtcBaseline: computePortfolioBtcValue(initialHoldings, prices),
			initialQuoteBaseline: getTotalPortfolioQuoteValue(
				initialHoldings,
				prices,
			),
		});
	}
}
