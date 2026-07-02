import { describe, expect, it } from "vitest";
import {
	formatRunFailure,
	formatRunReport,
	type RunReportInput,
} from "@/notifications/telegram/formatRunReport.js";
import { escapeUserDateTimeForMarkdown } from "@/notifications/telegram/formatUserDateTime.js";
import type { PredictionSignal } from "@/schemas/PredictionSignal.js";
import type { ScoredSocialMediaPost } from "@/schemas/ScoredSocialMediaPost.js";
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

const sampleScoredPost: ScoredSocialMediaPost = {
	externalId: "111",
	source: "twitter",
	username: "whale_alert",
	text: "Large BTC transfer detected",
	postedAt: "2026-06-16T12:00:00.000Z",
	impressions: 42_000,
	relevanceScore: 9,
	scoredAt: "2026-06-16T12:05:00.000Z",
};

const sampleScoredPostTwo: ScoredSocialMediaPost = {
	externalId: "222",
	source: "twitter",
	username: "macro_news",
	text: "Fed speaker struck a cautious tone",
	postedAt: "2026-06-16T11:30:00.000Z",
	impressions: 12_000,
	relevanceScore: 7,
	scoredAt: "2026-06-16T12:05:00.000Z",
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
		accumulateSymbol: "BTC",
		portfolioPerformance: {
			accumulateSymbol: "BTC",
			startingUsdValue: 10_000,
			currentUsdValue: 9_975,
			accumulateValue: 0.105,
			startingAccumulateValue: 0.10243902,
			assetPerformances: [],
		},
		outlookThresholds: DEFAULT_OUTLOOK_THRESHOLDS,
		...overrides,
	};
}

describe("formatRunReport", () => {
	it("includes the decision id when provided", () => {
		const message = formatRunReport(baseInput({ decisionId: 42 }));
		expect(message).toContain("Decision:");
		expect(message).toContain("\\#`42`");
	});

	it("includes the decision timestamp in UTC when locale and timezone are unset", () => {
		const createdAt = new Date("2026-06-16T15:30:00.000Z");
		const message = formatRunReport(
			baseInput({
				decisionId: 42,
				decisionCreatedAt: createdAt,
				userDateTimeSettings: { locale: null, timezone: null },
			}),
		);

		expect(message).toContain("Time:");
		expect(message).toContain("2026\\-06\\-16T15:30:00\\.000Z");
	});

	it("formats the decision timestamp with user locale and timezone", () => {
		const createdAt = new Date("2026-06-16T15:30:00.000Z");
		const message = formatRunReport(
			baseInput({
				decisionId: 42,
				decisionCreatedAt: createdAt,
				userDateTimeSettings: {
					locale: "en-US",
					timezone: "America/New_York",
				},
			}),
		);

		const expected = escapeUserDateTimeForMarkdown(createdAt, {
			locale: "en-US",
			timezone: "America/New_York",
		});

		expect(message).toContain("Time:");
		expect(message).toContain(expected);
	});

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
		expect(message).toContain("__*Performance:*__");
		expect(message).toContain(
			"Total USD Value: *$9,975\\.00* \\(*\\-0\\.25%*\\)",
		);
		expect(message).toContain(
			"BTC: *0\\.10500000* \\(started *0\\.10243902*\\)",
		);
	});

	it("shows only USD value when accumulating a USD stablecoin", () => {
		const message = formatRunReport(
			baseInput({
				accumulateSymbol: "USDC",
				portfolioPerformance: {
					accumulateSymbol: "USDC",
					startingUsdValue: 10_000,
					currentUsdValue: 9_975,
					accumulateValue: 9_975,
					startingAccumulateValue: 10_000,
					assetPerformances: [],
				},
			}),
		);

		expect(message).toContain("__*Performance:*__");
		expect(message).toContain(
			"Total USD Value: *$9,975\\.00* \\(*\\-0\\.25%*\\)",
		);
		expect(message).not.toMatch(/Performance:[\s\S]*USDC: \*/);
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

	it("omits the performance section when no portfolio performance is provided", () => {
		const input = baseInput();
		delete input.portfolioPerformance;
		const message = formatRunReport(input);

		expect(message).not.toContain("Performance:");
	});

	it("renders top scored posts from the last hour", () => {
		const message = formatRunReport(
			baseInput({
				socialMediaTopPosts: [sampleScoredPost, sampleScoredPostTwo],
				socialMediaScoringStats: {
					fetched: 12,
					newlyScored: 2,
					skippedAlreadyScored: 10,
				},
			}),
		);

		expect(message).toContain(
			"Fetched: 12 · Newly scored: 2 · Already scored: 10",
		);
		expect(message).toContain("Top posts \\(last hour\\):");
		expect(message).toContain(
			"1\\. *[@whale\\_alert \\(score 9\\)](https://x.com/whale_alert/status/111)* — Large BTC transfer detected",
		);
		expect(message).toContain(
			"2\\. *[@macro\\_news \\(score 7\\)](https://x.com/macro_news/status/222)* — Fed speaker struck a cautious tone",
		);
		expect(message).not.toContain("Themes:");
	});

	it("escapes MarkdownV2 special characters in the empty social section", () => {
		const message = formatRunReport(
			baseInput({
				socialMediaTopPosts: [],
				socialMediaScoringStats: {
					fetched: 0,
					newlyScored: 0,
					skippedAlreadyScored: 0,
				},
			}),
		);

		expect(message).toContain("No posts scored \\>\\=4 in the last hour\\.");
		expect(message).not.toContain("No posts scored >=4");
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
