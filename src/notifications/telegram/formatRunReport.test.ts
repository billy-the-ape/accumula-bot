import { describe, expect, it } from "vitest";
import {
	formatRunFailure,
	formatRunReport,
	type RunReportInput,
} from "@/notifications/telegram/formatRunReport.js";
import type { PredictionSignal } from "@/schemas/PredictionSignal.js";
import type { StoredTrade } from "@/schemas/Trade.js";
import type { AssetOutlook } from "@/schemas/TradeRecommendation.js";

const DEFAULT_OUTLOOK_THRESHOLDS = {
	buyMinDirectionScore: 7,
	sellMaxDirectionScore: 3,
	minConfidence: 0.6,
} as const;

const btcOutlook: AssetOutlook = {
	asset: "BTC",
	direction_score: 8,
	confidence: 0.72,
	reason: "Strong relative momentum",
};

const ethOutlook: AssetOutlook = {
	asset: "ETH",
	direction_score: 2,
	confidence: 0.6,
	reason: "Weak demand",
};

const sampleTrade: StoredTrade = {
	id: 1,
	portfolioId: 1,
	decisionId: 2,
	createdAt: new Date("2026-06-13T12:00:00Z"),
	side: "buy",
	symbol: "BTC",
	quantity: 0.01,
	priceUsd: 95_000,
	quoteValueUsd: 950,
};

const btcPrediction: PredictionSignal = {
	asset: "BTC",
	source: "polymarket",
	impliedUpProbability: 0.79,
	horizonHours: 24,
	liquidityUsd: 50_000,
	asOf: "2026-06-15T12:00:00.000Z",
	marketRef: "0xcondA",
	modeStrikeUsd: 68_500,
	spotUsd: 66_000,
	modeBucketProbability: 0.42,
};

function baseInput(overrides: Partial<RunReportInput> = {}): RunReportInput {
	return {
		outcome: "executed",
		headline: "BTC:BUY",
		averageConfidence: 0.72,
		outlooks: [btcOutlook],
		trades: [sampleTrade],
		executionReason: "Executed 1 planned fill(s)",
		predictionSignals: [],
		socialMediaSignals: [],
		accumulateSymbol: "BTC",
		portfolio: { btcValue: 0.105, returnPct: 2.5 },
		outlookThresholds: DEFAULT_OUTLOOK_THRESHOLDS,
		...overrides,
	};
}

describe("formatRunReport", () => {
	it("renders an executed run with trades, outlooks, and portfolio", () => {
		const message = formatRunReport(baseInput());

		expect(message).toContain("Trade Executed");
		expect(message).toContain("<u>Actions:</u> BTC:BUY · avg confidence 72%");
		expect(message).toContain("BTC");
		expect(message).toContain(" BUY ");
		expect(message).toContain("8/10");
		expect(message).toContain("72%");
		expect(message).toContain("Strong relative momentum");
		expect(message).toContain("<u>Trades:</u>");
		expect(message).toContain("BUY 0.01 BTC");
		expect(message).toContain(
			"0.10500000 BTC (+2.50% all-time vs initial baseline)",
		);
	});

	it("renders a hold run with no trades section", () => {
		const message = formatRunReport(
			baseInput({
				outcome: "hold",
				headline: "ALL:HOLD",
				trades: [],
				executionReason: "No trades planned",
			}),
		);

		expect(message).toContain("No Trades (Hold)");
		expect(message).toContain("<u>Status:</u> No trades planned");
		expect(message).not.toContain("<u>Trades:</u>");
	});

	it("renders a risk-blocked run with the violation reason", () => {
		const message = formatRunReport(
			baseInput({
				outcome: "risk_blocked",
				trades: [],
				executionReason: "Allocation cap exceeded for BTC",
			}),
		);

		expect(message).toContain("Trade Blocked (Risk)");
		expect(message).toContain("<u>Status:</u> Allocation cap exceeded for BTC");
	});

	it("includes prediction-market scores with mode vs spot when available", () => {
		const message = formatRunReport(
			baseInput({ predictionSignals: [btcPrediction] }),
		);

		expect(message).toContain("polymarket 0.79");
		expect(message).toContain("mode $68.5k vs spot $66.0k");
		expect(message).toContain("BTC|POLYM:");
	});

	it("labels SELL outlooks and escapes HTML in reasons", () => {
		const message = formatRunReport(
			baseInput({
				outlooks: [{ ...ethOutlook, reason: "drop <below> support & fail" }],
			}),
		);

		expect(message).toContain("ETH");
		expect(message).toContain(" SELL ");
		expect(message).toContain("2/10");
		expect(message).toContain("60%");
		expect(message).toContain("drop &lt;below&gt; support &amp; fail");
	});

	it("omits the portfolio line when no portfolio is provided", () => {
		const input = baseInput();
		delete input.portfolio;
		const message = formatRunReport(input);

		expect(message).not.toContain("Accumulated:");
	});
});

describe("formatRunFailure", () => {
	it("renders a failure alert with the escaped error message", () => {
		const message = formatRunFailure("LLM timeout <fatal> & gone");

		expect(message).toContain("Run Failed");
		expect(message).toContain(
			"<u>Error:</u> LLM timeout &lt;fatal&gt; &amp; gone",
		);
	});
});
