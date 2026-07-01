import type { AppConfig } from "@/config/index.js";
import type { OutlookThresholds } from "@/execution/outlookActions.js";
import { planAndValidateTrades } from "@/execution/planAndValidateTrades.js";
import { settleFill } from "@/execution/settleFill.js";
import type {
	ExecuteRecommendationInput,
	ExecutionEngine,
	ExecutionResult,
} from "@/execution/types.js";
import { DEFAULT_RISK_LIMITS } from "@/risk/riskLimits.js";
import type { StoredTrade } from "@/schemas/Trade.js";
import type { AppDatabase } from "@/storage/db.js";
import type { StoredPortfolio } from "@/storage/repositories/portfolioRepository.js";

export const DEFAULT_PAPER_STARTING_CASH_USD = 10_000;

export type PaperExecutionConfig = {
	tradeableSymbols: readonly string[];
	outlookThresholds: OutlookThresholds;
	maxPurchaseFraction?: number;
	maxPositionFraction?: number;
	maxRiskOnFraction?: number;
};

export function createPaperExecutionConfig(
	config: AppConfig,
): PaperExecutionConfig {
	return {
		tradeableSymbols: config.assetTradeable.map((asset) => asset.symbol),
		outlookThresholds: config.outlookThresholds,
		maxRiskOnFraction: config.riskGuardrails.maxRiskOnFraction,
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
		const planned = planAndValidateTrades({
			portfolio,
			recommendation: input.recommendation,
			marketSnapshots: input.marketSnapshots,
			tradeableSymbols: this.config.tradeableSymbols,
			outlookThresholds: this.config.outlookThresholds,
			maxPurchaseFraction:
				this.config.maxPurchaseFraction ??
				DEFAULT_RISK_LIMITS.maxAllocationPerPurchase,
			maxPositionFraction:
				this.config.maxPositionFraction ??
				DEFAULT_RISK_LIMITS.maxAllocationPerAsset,
			...(this.config.maxRiskOnFraction !== undefined
				? { maxRiskOnFraction: this.config.maxRiskOnFraction }
				: {}),
		});

		if (!planned.ok) {
			return {
				executed: false,
				reason: planned.reason,
				trades: [],
				...(planned.riskBlocked ? { riskBlocked: true } : {}),
			};
		}

		const trades: StoredTrade[] = [];
		for (const fill of planned.fills) {
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
			reason: `Executed ${planned.fills.length} planned fill(s)`,
			trades,
		};
	}
}
