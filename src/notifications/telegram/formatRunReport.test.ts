import { describe, expect, it } from "vitest";
import {
	formatRunFailure,
	formatRunReport,
	type RunReportInput,
} from "@/notifications/telegram/formatRunReport.js";
import type { PredictionSignal } from "@/schemas/PredictionSignal.js";
import type { SocialMediaAnalysis } from "@/schemas/SocialMediaAnalysis.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
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

const sampleSocialSignal: SocialMediaSignal = {
	index: 0,
	id: "111",
	source: "twitter",
	username: "whale_alert",
	text: "Large BTC transfer detected",
	asOf: "2026-06-16T12:00:00.000Z",
	impressions: 42_000,
};

const sampleSocialAnalysis: SocialMediaAnalysis = {
	total_retrieved: 12,
	relevant_count: 2,
	summary: "Whale alert amid macro noise.",
	themes: ["whale flow", "macro"],
	by_asset: [
		{
			asset: "BTC",
			sentiment: "mixed",
			note: "Whale deposit offset by steady ETF inflows.",
		},
		{
			asset: "ETH",
			sentiment: "bullish",
			note: "Layer-2 activity picked up overnight.",
		},
	],
	top_posts: [
		{
			post_id: 0,
			id: "twitter:111",
			username: "whale_alert",
			rank: 1,
			relevance: "high",
			assets: ["BTC"],
			signal_type: "whale_alert",
			summary: "Large BTC transfer detected",
			why: "Exchange inflow is the clearest near-term sell-pressure signal.",
		},
		{
			post_id: 1,
			id: "twitter:222",
			username: "macro_news",
			rank: 2,
			relevance: "medium",
			assets: ["MARKET"],
			signal_type: "macro",
			summary: "Fed speaker struck a cautious tone",
			why: "Macro tone may cap upside.",
		},
	],
};

function baseInput(overrides: Partial<RunReportInput> = {}): RunReportInput {
	return {
		outcome: "executed",
		summary: "BTC is going up",
		headline: "BTC:BUY",
		averageConfidence: 0.72,
		outlooks: [btcOutlook],
		trades: [sampleTrade],
		executionReason: "Executed 1 planned fill(s)",
		predictionSignals: [],
		socialMediaSignals: [],
		accumulateSymbol: "BTC",
		portfolioReport: {
			btcValue: 0.105,
			usdValue: 9_975,
			returnPct: 2.5,
			usdAllTimeReturnPct: -0.25,
		},
		outlookThresholds: DEFAULT_OUTLOOK_THRESHOLDS,
		...overrides,
	};
}

describe("formatRunReport", () => {
	it("renders an executed run with trades, outlooks, and portfolio", () => {
		const message = formatRunReport(baseInput());

		expect(message).toContain("Trade Executed");
		expect(message).toContain("BTC:BUY");
		expect(message).toContain("BTC");
		expect(message).toContain(" BUY ");
		expect(message).toContain("8/10");
		expect(message).toContain("72%");
		expect(message).toContain("Strong relative momentum");
		expect(message).toContain("Trades:");
		expect(message).toContain("BUY 0\\.01 BTC");
		expect(message).toContain("__*Current value:*__");
		expect(message).toContain("BTC: *0\\.10500000* · *\\+2\\.50%* all\\-time");
		expect(message).toContain("USD: * 9,975\\.00* · *\\-0\\.25%* all\\-time");
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

		expect(message).toContain("No Trades");
		expect(message).toContain("Hold");
		expect(message).toContain("No trades planned");
		expect(message).not.toContain("__*Trades:*__");
	});

	it("renders a risk-blocked run with the violation reason", () => {
		const message = formatRunReport(
			baseInput({
				outcome: "risk_blocked",
				trades: [],
				executionReason: "Allocation cap exceeded for BTC",
			}),
		);

		expect(message).toContain("Trade Blocked");
		expect(message).toContain("Risk");
		expect(message).toContain("Allocation cap exceeded for BTC");
	});

	it("includes prediction-market scores with mode vs spot when available", () => {
		const message = formatRunReport(
			baseInput({ predictionSignals: [btcPrediction] }),
		);

		expect(message).toContain("expects $68\\.5k vs current $66\\.0k");
		expect(message).toContain("BTC\\|POLYM: 0\\.79");
	});

	it("labels SELL outlooks and escapes MarkdownV2 in reasons", () => {
		const message = formatRunReport(
			baseInput({
				outlooks: [{ ...ethOutlook, reason: "drop <below> support & fail" }],
			}),
		);

		expect(message).toContain("ETH");
		expect(message).toContain(" SELL ");
		expect(message).toContain("2/10");
		expect(message).toContain("60%");
		expect(message).toContain("drop <below\\> support & fail");
	});

	it("omits the portfolio line when no portfolio is provided", () => {
		const input = baseInput();
		delete input.portfolioReport;
		const message = formatRunReport(input);

		expect(message).not.toContain("Current value:");
	});

	it("renders structured social analysis when Stage 1 succeeded", () => {
		const message = formatRunReport(
			baseInput({
				socialMediaAnalysis: sampleSocialAnalysis,
				socialMediaSignals: [
					sampleSocialSignal,
					{
						index: 1,
						id: "222",
						source: "twitter",
						username: "macro_news",
						text: "Fed speaker struck a cautious tone",
						asOf: "2026-06-16T12:00:00.000Z",
						impressions: 12_000,
					},
				],
			}),
		);

		expect(message).toContain(
			"Analyzed **12** posts from the last **24h**, **2** were relevant",
		);
		expect(message).toContain("whale flow, macro");
		expect(message).toContain("Most Relevant Posts:");
		expect(message).toContain(
			"1\\. *[From whale\\_alert](https://x.com/whale_alert/status/111)* — Exchange inflow is the clearest near\\-term sell\\-pressure signal\\.",
		);
		expect(message).toContain(
			"2\\. *[From macro\\_news](https://x.com/macro_news/status/222)* — Macro tone may cap upside\\.",
		);
		expect(message).toContain(
			"*BTC:* mixed — Whale deposit offset by steady ETF inflows\\.",
		);
		expect(message).toContain(
			"*ETH:* bullish — Layer\\-2 activity picked up overnight\\.",
		);
	});

	it("shows fallback counts when signals exist without analysis", () => {
		const message = formatRunReport(
			baseInput({ socialMediaSignals: [sampleSocialSignal] }),
		);

		expect(message).toContain("Retrieved: 1 · Analysis unavailable");
		expect(message).not.toContain("Top signals:");
	});

	it("shows None when social media is absent", () => {
		const message = formatRunReport(baseInput());

		expect(message).toContain("News & Social Media:");
		expect(message).toContain("_None_");
	});
});

describe("formatRunFailure", () => {
	it("renders a failure alert with the escaped error message", () => {
		const message = formatRunFailure("LLM timeout <fatal> & gone");

		expect(message).toContain("Run Failed");
		expect(message).toContain("__Error:__ LLM timeout <fatal\\> & gone");
	});
});
