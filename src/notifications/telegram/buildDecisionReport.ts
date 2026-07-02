import {
	getPredictionSignalsFromContext,
	getSocialMediaSectionFromContext,
} from "@/analysis/index.js";
import type { AppConfig } from "@/config/appConfigSchema.js";
import { buildPortfolioPerformanceInput } from "@/notifications/telegram/buildPortfolioSummaryInput.js";
import type { RunOutcome } from "@/notifications/telegram/formatRunReport.js";
import { formatRunReport } from "@/notifications/telegram/formatRunReport.js";
import { resolveOutlookThresholds } from "@/risk/riskTolerance.js";
import type { StoredTrade } from "@/schemas/Trade.js";
import { summarizeRecommendation } from "@/schemas/TradeRecommendation.js";
import type { AppDatabase } from "@/storage/db.js";
import {
	findDecisionById,
	listRecentDecisions,
} from "@/storage/repositories/decisionRepository.js";
import { getActivePortfolioForUser } from "@/storage/repositories/portfolioRepository.js";
import { findTelegramUserById } from "@/storage/repositories/telegramUserRepository.js";
import {
	listAllTradesForPortfolio,
	listTradesForDecisionAndPortfolio,
} from "@/storage/repositories/tradeRepository.js";

export type DecisionLookup = { kind: "last" } | { kind: "id"; id: number };

function toRunOutcome(trades: readonly StoredTrade[]): RunOutcome {
	return trades.length > 0 ? "executed" : "hold";
}

function resolveExecutionReason(
	outcome: RunOutcome,
	trades: readonly StoredTrade[],
): string {
	if (outcome === "executed") {
		return `Executed ${trades.length} trade${trades.length === 1 ? "" : "s"}.`;
	}

	return "No trades executed for your portfolio.";
}

export async function userCanAccessDecision(
	db: AppDatabase,
	telegramUserId: number,
	decisionId: number,
): Promise<boolean> {
	const portfolio = await getActivePortfolioForUser(db, telegramUserId);
	if (!portfolio) {
		return false;
	}

	const decision = await findDecisionById(db, decisionId);
	if (!decision) {
		return false;
	}

	return portfolio.createdAt.getTime() <= decision.createdAt.getTime();
}

async function resolveDecisionId(
	db: AppDatabase,
	target: DecisionLookup,
): Promise<number | undefined> {
	if (target.kind === "id") {
		const decision = await findDecisionById(db, target.id);
		return decision?.id;
	}

	const [latest] = await listRecentDecisions(db, 1);
	return latest?.id;
}

export async function buildDecisionReportForUser(
	db: AppDatabase,
	config: AppConfig,
	telegramUserId: number,
	target: DecisionLookup,
): Promise<{ text: string; decisionId: number } | undefined> {
	const decisionId = await resolveDecisionId(db, target);
	if (decisionId === undefined) {
		return undefined;
	}

	if (!(await userCanAccessDecision(db, telegramUserId, decisionId))) {
		return undefined;
	}

	const decision = await findDecisionById(db, decisionId);
	const portfolio = await getActivePortfolioForUser(db, telegramUserId);
	const telegramUser = await findTelegramUserById(db, telegramUserId);
	if (!decision || !portfolio) {
		return undefined;
	}

	const userDateTimeSettings = telegramUser
		? {
				locale: telegramUser.settings.locale,
				timezone: telegramUser.settings.timezone,
			}
		: { locale: null, timezone: null };

	const trades = await listTradesForDecisionAndPortfolio(
		db,
		portfolio.id,
		decisionId,
	);
	const allTrades = await listAllTradesForPortfolio(db, portfolio.id);
	const recommendationSummary = summarizeRecommendation(
		decision.recommendation,
	);
	const outcome = toRunOutcome(trades);
	const effectiveOutlookThresholds = resolveOutlookThresholds(
		config.outlookThresholds,
		portfolio.riskTolerance,
	);

	const socialMediaSection = decision.analysisContext
		? getSocialMediaSectionFromContext(decision.analysisContext)
		: undefined;
	const predictionSignals = decision.analysisContext
		? getPredictionSignalsFromContext(decision.analysisContext)
		: [];

	return {
		decisionId: decision.id,
		text: formatRunReport({
			decisionId: decision.id,
			decisionCreatedAt: decision.createdAt,
			userDateTimeSettings,
			outcome,
			headline: recommendationSummary.headline,
			averageConfidence: recommendationSummary.averageConfidence,
			outlooks: decision.recommendation.outlooks,
			trades,
			executionReason: resolveExecutionReason(outcome, trades),
			summary: decision.recommendation.summary,
			predictionSignals,
			...(socialMediaSection?.topPostsForReport
				? { socialMediaTopPosts: socialMediaSection.topPostsForReport }
				: {}),
			...(socialMediaSection?.scoringStats
				? { socialMediaScoringStats: socialMediaSection.scoringStats }
				: {}),
			accumulateSymbol: portfolio.assetToAccumulate,
			portfolio,
			outlookThresholds: effectiveOutlookThresholds,
			portfolioPerformance: buildPortfolioPerformanceInput(
				portfolio,
				decision.marketSnapshots,
				allTrades,
			),
		}),
	};
}
