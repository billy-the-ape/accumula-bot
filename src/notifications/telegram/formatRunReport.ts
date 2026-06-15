import type { OutlookThresholds } from "@/execution/outlookActions";
import type { PredictionSignal } from "@/schemas/PredictionSignal.js";
import type { StoredTrade } from "@/schemas/Trade.js";
import type { AssetOutlook } from "@/schemas/TradeRecommendation.js";

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
	/** Prediction-market signals to surface per asset (may be empty). */
	predictionSignals: readonly PredictionSignal[];
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

function directionLabel(
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

function truncate(value: string): string {
	return value.length > MAX_REASON_CHARS
		? `${value.slice(0, MAX_REASON_CHARS - 1)}…`
		: value;
}

function formatOutlookBlock(
	outlook: AssetOutlook,
	predictionSignals: readonly PredictionSignal[],
	outlookThresholds: OutlookThresholds,
): string[] {
	const asset = escapeHtml(outlook.asset);
	const lines = [
		`<b>${asset}</b> — ${directionLabel(outlook.direction_score, outlook.confidence, outlookThresholds)} (${outlook.direction_score}/10 · conf ${formatPercent(outlook.confidence)})`,
	];

	const predictions = predictionSignals
		.filter((signal) => signal.asset === outlook.asset)
		.map(
			(signal) =>
				`${escapeHtml(signal.source)} ${signal.impliedUpProbability.toFixed(2)}`,
		);
	if (predictions.length > 0) {
		lines.push(`  pred up-prob: ${predictions.join(" · ")}`);
	}

	if (outlook.reason) {
		lines.push(`  ${escapeHtml(truncate(outlook.reason))}`);
	}

	return lines;
}

function formatTradeLine(trade: StoredTrade): string {
	const action = trade.side.toUpperCase();
	return `${action} ${formatQuantity(trade.quantity)} ${escapeHtml(trade.symbol)} @ ${formatUsd(trade.priceUsd)} (${formatUsd(trade.quoteValueUsd)})`;
}

/**
 * Build the verbose, always-sent run report. Adapts to the three run outcomes
 * (executed / risk-blocked / hold) and includes the derived actions, per-asset
 * outlooks with prediction-market up-probabilities when available, any trades,
 * the execution status, and the portfolio's accumulated value + return.
 */
export function formatRunReport(input: RunReportInput): string {
	const lines: string[] = [
		OUTCOME_HEADERS[input.outcome],
		"",
		`<u>Actions:</u> ${escapeHtml(input.headline)} · avg confidence ${formatPercent(input.averageConfidence)}`,
		"",
		"<u>Outlooks:</u>",
		...input.outlooks.flatMap((outlook) =>
			formatOutlookBlock(
				outlook,
				input.predictionSignals,
				input.outlookThresholds,
			),
		),
	];

	if (input.trades.length > 0) {
		lines.push("", "<u>Trades:</u>", ...input.trades.map(formatTradeLine));
	}

	lines.push("", `<u>Status:</u> ${escapeHtml(input.executionReason)}`);

	if (input.portfolio) {
		const { btcValue, returnPct } = input.portfolio;
		lines.push(
			"",
			`<u>Accumulated:</u> ${btcValue.toFixed(8)} ${escapeHtml(input.accumulateSymbol)} (${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}% all-time vs initial baseline)`,
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
