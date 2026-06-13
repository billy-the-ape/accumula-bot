import type { AppConfig } from "@/config/index.js";
import { getTotalPortfolioQuoteValue } from "@/domain/allocation.js";
import { computePortfolioBtcValue } from "@/domain/btcBenchmark.js";
import type { PriceMap } from "@/domain/types.js";
import { planPaperTrades } from "@/execution/planPaperTrades.js";
import { buildPriceMap } from "@/execution/priceMap.js";
import { settleFill } from "@/execution/settleFill.js";
import type {
	ExecuteRecommendationInput,
	ExecutionEngine,
	ExecutionResult,
} from "@/execution/types.js";
import { DEFAULT_RISK_LIMITS } from "@/risk/riskLimits.js";
import { validateBeforeExecution } from "@/risk/validateBeforeExecution.js";
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
		const plan = planPaperTrades({
			holdings: portfolio.holdings,
			prices,
			recommendedAsset: input.recommendation.recommended_asset,
			cashSymbol: this.config.cashSymbol,
			maxPurchaseFraction,
			maxPositionFraction,
		});

		if (plan.fills.length === 0) {
			return {
				executed: false,
				reason: plan.holdReason ?? "No trades planned",
				trades: [],
			};
		}

		const buyFill = plan.fills.find(
			(fill) => fill.side === "buy" && fill.symbol !== this.config.cashSymbol,
		);
		const proposedTrade = buyFill
			? {
					symbol: buyFill.symbol,
					quoteValue: buyFill.quantity * buyFill.priceUsd,
				}
			: undefined;

		const risk = validateBeforeExecution({
			recommendation: input.recommendation,
			holdings: portfolio.holdings,
			prices,
			tradingEnabled: portfolio.tradingEnabled,
			dailyBaselineBtcValue: portfolio.dailyBaselineBtcValue,
			weeklyBaselineBtcValue: portfolio.weeklyBaselineBtcValue,
			cashSymbol: this.config.cashSymbol,
			tradeableSymbols: this.config.tradeableSymbols,
			...(proposedTrade ? { proposedTrade } : {}),
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
