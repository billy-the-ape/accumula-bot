import type { OutlookThresholds } from "@/execution/outlookActions";
import type { PredictionSignal } from "@/schemas/PredictionSignal.js";
import type { SocialMediaAnalysis } from "@/schemas/SocialMediaAnalysis.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal";
import type { StoredTrade } from "@/schemas/Trade.js";
import type { AssetOutlook } from "@/schemas/TradeRecommendation.js";
import { formatPredictionSignalDisplay } from "@/sources/prediction_markets/formatPredictionSignals.js";
import { resolveSocialMediaSignalForTopPost } from "@/sources/social_media/resolveSocialMediaSignal.js";

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
	portfolio?: {
		btcValue: number;
		returnPct: number;
	};
	outlookThresholds: OutlookThresholds;
};

const MAX_REASON_CHARS = 200;

const OUTCOME_HEADERS: Record<RunOutcome, string> = {
	executed: "💰<u><b>AccumulaBot — Trade Executed</b></u>💰",
	risk_blocked: "🛑<u><b>AccumulaBot — Trade Blocked (Risk)</b></u>🛑",
	hold: "😴<u><b>AccumulaBot — No Trades (Hold)</b></u>😴",
};

/** Escape the HTML special chars Telegram's HTML parse mode rejects. */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function formatUsd(value: number): string {
	return value.toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 2,
	});
}

function formatQuantity(value: number): string {
	return value.toLocaleString("en-US", { maximumFractionDigits: 8 });
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
	const asset = escapeHtml(outlook.asset);
	const lines = [
		`<b>· ${asset}:</b> ${directionLabel(outlook.direction_score, outlook.confidence, outlookThresholds)} · Outlook: ${outlook.direction_score}/10 · Confidence: ${formatPercent(outlook.confidence)} ${
			outlook.confidence >= outlookThresholds.minConfidence ? "🟢" : "🔴"
		}`,
	];

	if (outlook.reason) {
		lines.push(`  Reasoning: ${escapeHtml(truncate(outlook.reason))}`);
	}

	return lines;
}

function formatTradeLine(trade: StoredTrade): string {
	const action = trade.side.toUpperCase();
	return `${action} ${formatQuantity(trade.quantity)} ${escapeHtml(trade.symbol)} @ ${formatUsd(trade.priceUsd)} (${formatUsd(trade.quoteValueUsd)})`;
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
			`  <u>Themes:</u>`,
			`    ${escapeHtml(analysis.themes.join(", ").replace(/_/g, " "))}`,
			"",
		);
	}

	const sortedTopPosts = [...analysis.top_posts].sort(
		(a, b) => a.rank - b.rank,
	);

	if (sortedTopPosts.length > 0) {
		lines.push("  <u>Top posts:</u>");
		for (const topPost of sortedTopPosts) {
			const signal = resolveSocialMediaSignalForTopPost(topPost, signals);
			const username = signal?.username ?? topPost.username;
			const externalId = signal?.id ?? topPost.id.replace(/^twitter:/, "");
			const text =
				/* signal
				? truncateSocialMediaPostText(signal.text)
				:  */ topPost.why;
			const headline = `<b><a href="https://x.com/${escapeHtml(username)}/status/${escapeHtml(externalId)}">From ${escapeHtml(username)}</a></b> — ${escapeHtml(truncate(text))}`;
			lines.push(`    ${topPost.rank}. ${headline}`);
		}
		lines.push("");
	}

	if (analysis.by_asset.length > 0) {
		lines.push("  <u>Sentiments:</u>");
		for (const entry of analysis.by_asset) {
			lines.push(
				`    <b>${escapeHtml(entry.asset)}:</b> ${entry.sentiment} — ${escapeHtml(truncate(entry.note))}`,
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

	return "<i>None</i>";
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
						return `  ${signal.asset}|${signal.source.toUpperCase().slice(0, 5)}: ${formatPredictionSignalDisplay(signal)}`;
					})
					.join("\n")
			: "<i>None</i>";

	const lines: string[] = [
		OUTCOME_HEADERS[input.outcome],
		"",
		`<u><b>Actions:</b></u>`,
		...input.outlooks.flatMap(
			(outlook) =>
				`${outlook.asset}:${getDirectionString(outlook.direction_score, outlook.confidence, input.outlookThresholds)}`,
		),
		"",
		"<u><b>News & Social Media:</b></u>",
		socialMediaSignalsLines,
		"<u><b>Prediction Markets:</b></u>",
		predictionSignalsLines,
		"",
		"<u><b>Plans:</b></u>",
		...input.outlooks.flatMap((outlook) =>
			formatOutlookBlock(outlook, input.outlookThresholds),
		),
	];

	if (input.trades.length > 0) {
		lines.push(
			"",
			"<u><b>Trades:</b></u>",
			...input.trades.map(formatTradeLine),
		);
	} else {
		lines.push("", "<u><b>No trades executed</b></u>");
	}

	lines.push("", `<u><b>Status:</b></u>`, escapeHtml(input.executionReason));

	lines.push(
		"",
		`<u><b>Summary:</b></u>`,
		!input.summary ? "<i>None</i>" : escapeHtml(input.summary),
	);

	if (input.portfolio) {
		const { btcValue, returnPct } = input.portfolio;
		lines.push(
			"",
			`<u><b>Accumulated:</b></u>`,
			`${btcValue.toFixed(8).replace(/0+$/, "")} ${escapeHtml(input.accumulateSymbol)} (${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}% all-time vs initial baseline)`,
		);
	}

	return lines.join("\n");
}

/** Minimal alert for a run that threw before a normal report could be built. */
export function formatRunFailure(message: string): string {
	return [
		"⚠️<u><b>AccumulaBot — Run Failed</b></u>⚠️",
		"",
		`<u>Error:</u> ${escapeHtml(message)}`,
	].join("\n");
}
