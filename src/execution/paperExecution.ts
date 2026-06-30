import type { AppConfig } from "@/config/index.js";
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
import { resolveOutlookThresholds } from "@/risk/riskTolerance.js";
import type { StoredTrade } from "@/schemas/Trade.js";
import type { AppDatabase } from "@/storage/db.js";
import type { StoredPortfolio } from "@/storage/repositories/portfolioRepository.js";

export const DEFAULT_PAPER_STARTING_CASH_USD = 10_000;

export type PaperExecutionConfig = {
	tradeableSymbols: readonly string[];
	outlookThresholds: OutlookThresholds;
	maxPurchaseFraction?: number;
	maxPositionFraction?: number;
};

export function createPaperExecutionConfig(
	config: AppConfig,
): PaperExecutionConfig {
	return {
		tradeableSymbols: config.assetTradeable.map((asset) => asset.symbol),
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
		if (!input.portfolio) {
			return {
				executed: false,
				reason: "No portfolio provided",
				trades: [],
			};
		}

		return this.executeForPortfolio(input.portfolio, input);
	}

	async executeForPortfolio(
		portfolio: StoredPortfolio,
		input: ExecuteRecommendationInput,
	): Promise<ExecutionResult> {
		const maxPurchaseFraction =
			this.config.maxPurchaseFraction ??
			DEFAULT_RISK_LIMITS.maxAllocationPerPurchase;
		const maxPositionFraction =
			this.config.maxPositionFraction ??
			DEFAULT_RISK_LIMITS.maxAllocationPerAsset;
		const thresholds = resolveOutlookThresholds(
			this.config.outlookThresholds,
			portfolio.riskTolerance,
		);

		const prices = buildPriceMap(input.marketSnapshots, portfolio.cashSymbol, {
			accumulateSymbol: portfolio.assetToAccumulate,
		});
		const plan = planTrades({
			holdings: portfolio.holdings,
			prices,
			outlooks: input.recommendation.outlooks,
			cashSymbol: portfolio.cashSymbol,
			maxPurchaseFraction,
			maxPositionFraction,
			thresholds,
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
			accumulateSymbol: portfolio.assetToAccumulate,
			dailyBaselineBtcValue: portfolio.dailyBaselineBtcValue,
			weeklyBaselineBtcValue: portfolio.weeklyBaselineBtcValue,
			cashSymbol: portfolio.cashSymbol,
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
				portfolio.cashSymbol,
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
}
