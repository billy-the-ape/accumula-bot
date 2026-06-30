import type { AppConfig } from "@/config/appConfigSchema.js";
import {
	computePortfolioAccumulateValue,
	computeReturnFraction,
	getTotalPortfolioQuoteValue,
} from "@/domain/index.js";
import type { OutlookThresholds } from "@/execution/outlookActions.js";
import {
	createPaperExecutionConfig,
	PaperExecution,
} from "@/execution/paperExecution.js";
import { buildPriceMap } from "@/execution/priceMap.js";
import type { ExecutionResult } from "@/execution/types.js";
import type { RunOutcome } from "@/notifications/telegram/formatRunReport.js";
import { resolveOutlookThresholds } from "@/risk/riskTolerance.js";
import type { MarketSnapshot } from "@/schemas/MarketSnapshot.js";
import type { TradeRecommendation } from "@/schemas/TradeRecommendation.js";
import type { AppDatabase } from "@/storage/db.js";
import {
	type ActivePortfolio,
	findPortfolioById,
	listActivePortfolios,
} from "@/storage/repositories/portfolioRepository.js";

export type ExecuteActivePortfoliosInput = {
	recommendation: TradeRecommendation;
	marketSnapshots: readonly MarketSnapshot[];
	decisionId: number;
};

export type PortfolioReport = {
	btcValue: number;
	usdValue: number;
	returnPct: number;
	usdAllTimeReturnPct: number;
};

export type ActivePortfolioRunResult = {
	portfolio: ActivePortfolio;
	execution: ExecutionResult;
	outcome: RunOutcome;
	portfolioReport: PortfolioReport;
	effectiveOutlookThresholds: OutlookThresholds;
};

export function buildPortfolioReport(
	portfolio: {
		holdings: ActivePortfolio["holdings"];
		assetToAccumulate: string;
		cashSymbol: string;
		initialBtcBaseline: number;
		initialQuoteBaseline: number;
	},
	marketSnapshots: readonly MarketSnapshot[],
): PortfolioReport {
	const prices = buildPriceMap(marketSnapshots, portfolio.cashSymbol, {
		accumulateSymbol: portfolio.assetToAccumulate,
	});
	const accumulateValue = computePortfolioAccumulateValue(
		portfolio.holdings,
		prices,
		portfolio.assetToAccumulate,
	);
	const usdValue = getTotalPortfolioQuoteValue(portfolio.holdings, prices);

	return {
		btcValue: accumulateValue,
		usdValue,
		returnPct:
			computeReturnFraction(accumulateValue, portfolio.initialBtcBaseline) *
			100,
		usdAllTimeReturnPct:
			computeReturnFraction(usdValue, portfolio.initialQuoteBaseline) * 100,
	};
}

function toRunOutcome(execution: ExecutionResult): RunOutcome {
	if (execution.executed) {
		return "executed";
	}
	if (execution.riskBlocked) {
		return "risk_blocked";
	}
	return "hold";
}

export async function executeActivePortfolios(
	db: AppDatabase,
	config: AppConfig,
	input: ExecuteActivePortfoliosInput,
): Promise<ActivePortfolioRunResult[]> {
	const activePortfolios = await listActivePortfolios(db);
	if (activePortfolios.length === 0) {
		return [];
	}

	const paperExecution = new PaperExecution(
		db,
		createPaperExecutionConfig(config),
	);
	const results: ActivePortfolioRunResult[] = [];

	for (const activePortfolio of activePortfolios) {
		const execution = await paperExecution.executeForPortfolio(
			activePortfolio,
			{
				recommendation: input.recommendation,
				marketSnapshots: input.marketSnapshots,
				decisionId: input.decisionId,
			},
		);

		const portfolio =
			(await findPortfolioById(db, activePortfolio.id)) ?? activePortfolio;
		const portfolioReport = buildPortfolioReport(
			portfolio,
			input.marketSnapshots,
		);
		const effectiveOutlookThresholds = resolveOutlookThresholds(
			config.outlookThresholds,
			portfolio.riskTolerance,
		);

		results.push({
			portfolio: {
				...portfolio,
				telegramChatId: activePortfolio.telegramChatId,
				verbose: activePortfolio.verbose,
			},
			execution,
			outcome: toRunOutcome(execution),
			portfolioReport,
			effectiveOutlookThresholds,
		});
	}

	return results;
}
