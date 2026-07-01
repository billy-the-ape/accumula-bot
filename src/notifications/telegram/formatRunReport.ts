import type { OutlookThresholds } from "@/execution/outlookActions";
import {
	bold,
	boldLink,
	boldUnderline,
	code,
	escapeMarkdownV2,
	italic,
	underline,
} from "@/notifications/telegram/escapeMarkdownV2.js";
import { escapeUserDateTimeForMarkdown } from "@/notifications/telegram/formatUserDateTime.js";
import type { PredictionSignal } from "@/schemas/PredictionSignal.js";
import type { ScoredSocialMediaPost } from "@/schemas/ScoredSocialMediaPost.js";
import type { StoredTrade } from "@/schemas/Trade.js";
import type { AssetOutlook } from "@/schemas/TradeRecommendation.js";
import { formatPredictionSignalDisplay } from "@/sources/prediction_markets/formatPredictionSignals.js";
import type { SocialMediaScoringStats } from "@/sources/social_media/processSocialMediaSignals.js";
import { SOCIAL_MEDIA_MIN_RELEVANCE_SCORE } from "@/sources/social_media/socialMediaScoringConstants.js";
import type { StoredPortfolio } from "@/storage";
import type { TelegramUserSettings } from "@/storage/telegramUserSettings.js";

export type RunOutcome = "executed" | "risk_blocked" | "hold";

export type RunReportInput = {
	decisionId?: number;
	decisionCreatedAt?: Date;
	userDateTimeSettings?: Pick<TelegramUserSettings, "locale" | "timezone">;
	outcome: RunOutcome;
	/** Derived actions headline, e.g. "BTC:BUY,ETH:SELL" or "HOLD". */
	headline: string;
	/** Mean model confidence across outlooks (0–1). */
	averageConfidence: number;
	outlooks: readonly AssetOutlook[];
	trades: readonly StoredTrade[];
	/** Execution engine reason (why trades ran / were blocked / skipped). */
	executionReason: string;
	summary: string | undefined;
	/** Prediction-market signals to surface per asset (may be empty). */
	predictionSignals: readonly PredictionSignal[];
	/** Top scored posts from the last hour for Telegram. */
	socialMediaTopPosts?: readonly ScoredSocialMediaPost[];
	/** Scoring pipeline stats when available. */
	socialMediaScoringStats?: SocialMediaScoringStats;
	accumulateSymbol: string;
	portfolio?: StoredPortfolio;
	portfolioReport?: {
		btcValue: number;
		usdValue: number;
		/** All-time return vs initial BTC baseline (%). */
		returnPct: number;
		/** All-time return vs initial USD baseline (%). */
		usdAllTimeReturnPct: number;
	};
	outlookThresholds: OutlookThresholds;
};

const MAX_REASON_CHARS = 200;

const OUTCOME_HEADERS: Record<RunOutcome, string> = {
	executed: `💰${boldUnderline("AccumulaBot — Trade Executed")}💰`,
	risk_blocked: `🛑${boldUnderline("AccumulaBot — Trade Blocked (Risk)")}🛑`,
	hold: `😴${boldUnderline("AccumulaBot — No Trades (Hold)")}😴`,
};

function formatUsd(value: number): string {
	return value.toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 2,
	});
}

function formatUsdPlain(value: number): string {
	return value.toLocaleString("en-US", {
		maximumFractionDigits: 2,
		minimumFractionDigits: 2,
	});
}

function formatReturnPct(value: number): string {
	return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatQuantity(value: number): string {
	return value
		.toLocaleString("en-US", { maximumFractionDigits: 8 })
		.replace(/\.0+$/, "");
}

function formatPercent(fraction: number): string {
	return `${Math.round(fraction * 100)}%`;
}

function getDirectionString(
	directionScore: number,
	confidence: number,
	outlookThresholds: OutlookThresholds,
): string {
	if (confidence < outlookThresholds.minConfidence) {
		return "HOLD";
	}
	if (directionScore >= outlookThresholds.buyMinDirectionScore) {
		return "BUY";
	}
	if (directionScore <= outlookThresholds.sellMaxDirectionScore) {
		return "SELL";
	}
	return "HOLD";
}

function directionLabel(
	directionScore: number,
	confidence: number,
	outlookThresholds: OutlookThresholds,
): string {
	const directionString = getDirectionString(
		directionScore,
		confidence,
		outlookThresholds,
	);
	if (confidence < outlookThresholds.minConfidence) {
		return `🤷‍♂️ ${directionString}`;
	}
	if (directionScore >= outlookThresholds.buyMinDirectionScore) {
		return `📈 ${directionString}`;
	}
	if (directionScore <= outlookThresholds.sellMaxDirectionScore) {
		return `📉 ${directionString}`;
	}
	return `🙅 ${directionString}`;
}

function truncate(value: string, maxChars: number = MAX_REASON_CHARS): string {
	return value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value;
}

function formatOutlookBlock(
	outlook: AssetOutlook,
	outlookThresholds: OutlookThresholds,
): string[] {
	const asset = escapeMarkdownV2(outlook.asset);
	const lines = [
		`${bold(`· ${asset}:`)} ${directionLabel(outlook.direction_score, outlook.confidence, outlookThresholds)} · Outlook: ${outlook.direction_score}/10 · Confidence: ${formatPercent(outlook.confidence)} ${
			outlook.confidence >= outlookThresholds.minConfidence ? "🟢" : "🔴"
		}`,
	];

	if (outlook.reason) {
		lines.push(`  Reasoning: ${escapeMarkdownV2(truncate(outlook.reason))}`);
	}

	return lines;
}

function formatTradeLine(trade: StoredTrade): string {
	const action = trade.side.toUpperCase();
	return `${action} ${escapeMarkdownV2(formatQuantity(trade.quantity))} ${escapeMarkdownV2(trade.symbol)} @ ${escapeMarkdownV2(formatUsd(trade.priceUsd))} \\(${escapeMarkdownV2(formatUsd(trade.quoteValueUsd))}\\)`;
}

function formatSocialMediaScoredSection(
	topPosts: readonly ScoredSocialMediaPost[],
	stats?: SocialMediaScoringStats,
): string {
	const lines: string[] = [];

	if (stats) {
		lines.push(
			`  Fetched: ${escapeMarkdownV2(String(stats.fetched))} · Newly scored: ${escapeMarkdownV2(String(stats.newlyScored))} · Already scored: ${escapeMarkdownV2(String(stats.skippedAlreadyScored))}`,
			"",
		);
	}

	if (topPosts.length === 0) {
		lines.push(
			escapeMarkdownV2(
				`  No posts scored >=${SOCIAL_MEDIA_MIN_RELEVANCE_SCORE} in the last hour.`,
			),
		);
		return lines.join("\n");
	}

	lines.push(`  ${underline("Top posts (last hour):")}`);
	for (const [index, post] of topPosts.entries()) {
		const linkText = `@${post.username} (score ${post.relevanceScore})`;
		const url = `https://x.com/${post.username}/status/${post.externalId}`;
		const text = truncate(post.text, 60);
		lines.push(
			`    ${index + 1}\\. ${boldLink(linkText, url)} — ${escapeMarkdownV2(text)}`,
		);
	}
	lines.push("");

	return lines.join("\n");
}

function formatSocialMediaSection(input: RunReportInput): string {
	if (input.socialMediaTopPosts || input.socialMediaScoringStats) {
		return formatSocialMediaScoredSection(
			input.socialMediaTopPosts ?? [],
			input.socialMediaScoringStats,
		);
	}

	return italic("None");
}

/**
 * Build the verbose, always-sent run report. Adapts to the three run outcomes
 * (executed / risk-blocked / hold) and includes the derived actions, per-asset
 * outlooks with prediction-market up-probabilities when available, any trades,
 * the execution status, and the portfolio's accumulated value + return.
 */
export function formatRunReport(input: RunReportInput): string {
	const socialMediaSignalsLines = formatSocialMediaSection(input);
	const predictionSignalsLines =
		input.predictionSignals.length > 0
			? input.predictionSignals
					.map((signal) => {
						return `  ${escapeMarkdownV2(signal.asset)}\\|${escapeMarkdownV2(signal.source.toUpperCase().slice(0, 5))}: ${escapeMarkdownV2(formatPredictionSignalDisplay(signal))}`;
					})
					.join("\n")
			: italic("None");

	const lines: string[] = [OUTCOME_HEADERS[input.outcome], ""];

	if (input.decisionId !== undefined) {
		lines.push(`${bold("Decision:")} \\#${code(String(input.decisionId))}`);
	}

	if (input.decisionCreatedAt !== undefined) {
		const formattedTime = escapeUserDateTimeForMarkdown(
			input.decisionCreatedAt,
			input.userDateTimeSettings ?? { locale: null, timezone: null },
		);
		lines.push(`${bold("Time:")} ${formattedTime}`);
	}

	if (input.decisionId !== undefined || input.decisionCreatedAt !== undefined) {
		lines.push("");
	}

	lines.push(
		boldUnderline("Actions:"),
		...input.outlooks.flatMap(
			(outlook) =>
				`${escapeMarkdownV2(outlook.asset)}:${getDirectionString(outlook.direction_score, outlook.confidence, input.outlookThresholds)}`,
		),
		"",
		boldUnderline("News & Social Media:"),
		socialMediaSignalsLines,
		boldUnderline("Prediction Markets:"),
		predictionSignalsLines,
		"",
		boldUnderline("Plans:"),
		...input.outlooks.flatMap((outlook) =>
			formatOutlookBlock(outlook, input.outlookThresholds),
		),
	);

	if (input.trades.length > 0) {
		lines.push(
			"",
			boldUnderline("Trades:"),
			...input.trades.map(formatTradeLine),
		);
	} else {
		lines.push("", boldUnderline("No trades executed"));
	}

	lines.push(
		"",
		boldUnderline("Status:"),
		escapeMarkdownV2(input.executionReason),
	);

	lines.push(
		"",
		boldUnderline("Summary:"),
		!input.summary ? italic("None") : escapeMarkdownV2(input.summary),
	);

	if (input.portfolio) {
		const { holdings } = input.portfolio;
		lines.push(
			"",
			boldUnderline("Current Portfolio:"),
			`${Object.entries(holdings)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(
					([symbol, quantity]) =>
						`${symbol}: ${escapeMarkdownV2(formatQuantity(quantity))}`,
				)
				.join("\n")}`,
		);
	}

	if (input.portfolioReport) {
		const { btcValue, usdValue, returnPct, usdAllTimeReturnPct } =
			input.portfolioReport;
		lines.push(
			"",
			boldUnderline("Current value:"),
			`${escapeMarkdownV2(input.accumulateSymbol)}: ${bold(btcValue.toFixed(8))} · ${bold(formatReturnPct(returnPct))} all\\-time`,
			`USD: ${bold(` ${formatUsdPlain(usdValue)}`)} · ${bold(formatReturnPct(usdAllTimeReturnPct))} all\\-time`,
		);
	}

	return lines.join("\n");
}

/** Minimal alert for a run that threw before a normal report could be built. */
export function formatRunFailure(message: string): string {
	return [
		`⚠️${boldUnderline("AccumulaBot — Run Failed")}⚠️`,
		"",
		`${underline("Error:")} ${escapeMarkdownV2(message)}`,
	].join("\n");
}
