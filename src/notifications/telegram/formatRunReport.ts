import type { OutlookThresholds } from "@/execution/outlookActions";
import {
	bold,
	boldLink,
	boldUnderline,
	escapeMarkdownV2,
	italic,
	underline,
} from "@/notifications/telegram/escapeMarkdownV2.js";
import type { PredictionSignal } from "@/schemas/PredictionSignal.js";
import type { SocialMediaAnalysis } from "@/schemas/SocialMediaAnalysis.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal";
import type { StoredTrade } from "@/schemas/Trade.js";
import type { AssetOutlook } from "@/schemas/TradeRecommendation.js";
import { formatPredictionSignalDisplay } from "@/sources/prediction_markets/formatPredictionSignals.js";
import { resolveSocialMediaSignalForTopPost } from "@/sources/social_media/resolveSocialMediaSignal.js";
import type { StoredPortfolio } from "@/storage";

export type RunOutcome = "executed" | "risk_blocked" | "hold";

export type RunReportInput = {
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
	/** Social media signals to surface (may be empty). */
	socialMediaSignals: readonly SocialMediaSignal[];
	/** Stage 1 social analysis when available (undefined on fallback/disabled). */
	socialMediaAnalysis?: SocialMediaAnalysis;
	accumulateSymbol: string;
	portfolio?: StoredPortfolio;
	portfolioReport?: {
		btcValue: number;
		returnPct: number;
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

function formatQuantity(value: number): string {
	return value
		.toLocaleString("en-US", { maximumFractionDigits: 8 })
		.replace(/0+$/, "");
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

function truncate(value: string): string {
	return value.length > MAX_REASON_CHARS
		? `${value.slice(0, MAX_REASON_CHARS - 1)}…`
		: value;
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

function formatSocialMediaFallbackSection(
	signals: readonly SocialMediaSignal[],
): string {
	return [`  Retrieved: ${signals.length} · Analysis unavailable`, ""].join(
		"\n",
	);
}

function formatSocialMediaAnalysisSection(
	analysis: SocialMediaAnalysis,
	signals: readonly SocialMediaSignal[],
): string {
	const lines: string[] = [
		`  Analyzed ${analysis.total_retrieved} posts, ${analysis.relevant_count} relevant`,
		"",
	];

	if (analysis.themes.length > 0) {
		lines.push(
			`  ${underline("Themes:")}`,
			`    ${escapeMarkdownV2(analysis.themes.join(", ").replace(/_/g, " "))}`,
			"",
		);
	}

	const sortedTopPosts = [...analysis.top_posts].sort(
		(a, b) => a.rank - b.rank,
	);

	if (sortedTopPosts.length > 0) {
		lines.push(`  ${underline("Most Relevant Posts:")}`);
		for (const topPost of sortedTopPosts) {
			const signal = resolveSocialMediaSignalForTopPost(topPost, signals);
			const username = signal?.username ?? topPost.username;
			const externalId = signal?.id ?? topPost.id.replace(/^twitter:/, "");
			const text =
				/* signal
				? truncateSocialMediaPostText(signal.text)
				:  */ topPost.why;
			const linkText = `From ${username}`;
			const url = `https://x.com/${username}/status/${externalId}`;
			const headline = `${boldLink(linkText, url)} — ${escapeMarkdownV2(truncate(text))}`;
			lines.push(`    ${topPost.rank}. ${headline}`);
		}
		lines.push("");
	}

	if (analysis.by_asset.length > 0) {
		lines.push(`  ${underline("Sentiments:")}`);
		for (const entry of analysis.by_asset) {
			lines.push(
				`    ${bold(`${entry.asset}:`)} ${escapeMarkdownV2(entry.sentiment)} — ${escapeMarkdownV2(truncate(entry.note))}`,
			);
		}
		lines.push("");
	}

	return lines.join("\n");
}

function formatSocialMediaSection(input: RunReportInput): string {
	if (input.socialMediaAnalysis) {
		return formatSocialMediaAnalysisSection(
			input.socialMediaAnalysis,
			input.socialMediaSignals,
		);
	}

	if (input.socialMediaSignals.length > 0) {
		return formatSocialMediaFallbackSection(input.socialMediaSignals);
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

	const lines: string[] = [
		OUTCOME_HEADERS[input.outcome],
		"",
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
	];

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
		const { btcValue, returnPct } = input.portfolioReport;
		const btcValueStr = btcValue.toFixed(8).replace(/0+$/, "");
		const returnSign = returnPct >= 0 ? "\\+" : "";
		const returnStr = returnPct.toFixed(2);
		const lessOrMore = returnPct >= 0 ? "less" : "more";
		lines.push(
			"",
			boldUnderline("Accumulated Value:"),
			`${escapeMarkdownV2(btcValueStr)} ${escapeMarkdownV2(input.accumulateSymbol)} \\(${returnSign}${escapeMarkdownV2(returnStr)}% all\\-time vs initial ${escapeMarkdownV2(input.accumulateSymbol)} baseline\\)`,
			italic(
				`In other words, if you had bought ${input.accumulateSymbol} at the start of this portfolio, you would have ${returnStr} ${lessOrMore} ${input.accumulateSymbol} than you do now`,
			),
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
