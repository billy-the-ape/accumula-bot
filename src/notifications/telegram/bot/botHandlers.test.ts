import { describe, expect, it } from "vitest";
import { formatPortfolioSummary } from "@/notifications/telegram/bot/formatPortfolioSummary.js";
import { handleBotMessage } from "@/notifications/telegram/bot/handleBotMessage.js";
import {
	parseOnboardingDraft,
	serializeOnboardingDraft,
} from "@/notifications/telegram/bot/onboardingDraft.js";
import { parseBotCommand } from "@/notifications/telegram/bot/parseBotCommand.js";
import { parseStartingValueInput } from "@/notifications/telegram/bot/parseStartingValue.js";
import {
	parsePortfolioModeCallback,
	portfolioModeCallbackData,
} from "@/notifications/telegram/bot/portfolioModeKeyboard.js";
import {
	parseRiskToleranceCallback,
	riskToleranceCallbackData,
} from "@/notifications/telegram/bot/riskToleranceKeyboard.js";
import {
	parseStartingValueCallback,
	STARTING_VALUE_DEFAULT_CALLBACK,
} from "@/notifications/telegram/bot/startingValueKeyboard.js";
import type { BotHandlerContext } from "@/notifications/telegram/bot/types.js";
import { MIN_CONFIDENCE_BY_RISK_TOLERANCE } from "@/risk/riskTolerance.js";
import { DEFAULT_TELEGRAM_USER_SETTINGS } from "@/storage/telegramUserSettings.js";

const sampleSummary = {
	accumulateSymbol: "BTC",
	startedAt: new Date("2026-01-01T00:00:00.000Z"),
	holdings: { USDC: 10_000 },
	startingUsdValue: 10_000,
	currentUsdValue: 10_500,
	accumulateValue: 0.1,
	startingAccumulateValue: 0.095,
	allTimeReturnPct: 5.26,
	assetPerformances: [],
	riskTolerance: "medium" as const,
	minConfidence: MIN_CONFIDENCE_BY_RISK_TOLERANCE.medium,
};

const onboardedContext: BotHandlerContext = {
	onboardingState: null,
	onboardingDraftJson: null,
	hasActivePortfolio: true,
	settings: DEFAULT_TELEGRAM_USER_SETTINGS,
};

describe("parseStartingValueInput", () => {
	it("accepts numeric amounts with commas", () => {
		expect(parseStartingValueInput("12,500")).toEqual({
			ok: true,
			valueUsd: 12_500,
		});
	});

	it("rejects non-positive values", () => {
		expect(parseStartingValueInput("0").ok).toBe(false);
		expect(parseStartingValueInput("-100").ok).toBe(false);
		expect(parseStartingValueInput("abc").ok).toBe(false);
	});
});

describe("parseBotCommand", () => {
	it("parses commands with optional bot suffix", () => {
		expect(parseBotCommand("/start@AccumulaBot")).toBe("start");
		expect(parseBotCommand("/summary")).toBe("summary");
		expect(parseBotCommand("/status")).toBe("status");
		expect(parseBotCommand("/reset")).toBe("reset");
		expect(parseBotCommand("/liquidate")).toBe("liquidate");
		expect(parseBotCommand("/settings")).toBe("settings");
		expect(parseBotCommand("/portfolio")).toBe("portfolio");
		expect(parseBotCommand("/decision")).toBe("decision");
		expect(parseBotCommand("/macro")).toBe("macro");
	});

	it("returns undefined for unknown commands", () => {
		expect(parseBotCommand("/help")).toBeUndefined();
		expect(parseBotCommand("hello")).toBeUndefined();
	});
});

describe("parseStartingValueCallback", () => {
	it("parses default starting value callback", () => {
		expect(parseStartingValueCallback(STARTING_VALUE_DEFAULT_CALLBACK)).toBe(
			10_000,
		);
		expect(parseStartingValueCallback("starting_value:other")).toBeUndefined();
	});
});

describe("parseRiskToleranceCallback", () => {
	it("parses risk callback data", () => {
		expect(parseRiskToleranceCallback(riskToleranceCallbackData("low"))).toBe(
			"low",
		);
		expect(parseRiskToleranceCallback("risk:medium")).toBe("medium");
		expect(parseRiskToleranceCallback("other")).toBeUndefined();
	});
});

describe("onboarding draft", () => {
	it("round-trips starting value", () => {
		const json = serializeOnboardingDraft({ startingValueUsd: 8_000 });
		expect(parseOnboardingDraft(json)).toEqual({ startingValueUsd: 8_000 });
	});
});

describe("formatPortfolioSummary", () => {
	it("includes holdings and settings", () => {
		const text = formatPortfolioSummary(sampleSummary);
		expect(text).toContain("Portfolio summary");
		expect(text).toContain("Started 2026\\-01\\-01T00:00:00\\.000Z");
		expect(text).toContain("USDC");
		expect(text).toContain("Medium");
		expect(text).toContain("Min confidence to trade");
	});

	it("adds reset hint only when requested", () => {
		const withHint = formatPortfolioSummary(sampleSummary, {
			includeResetHint: true,
		});
		const withoutHint = formatPortfolioSummary(sampleSummary);

		expect(withHint).toContain("/reset");
		expect(withoutHint).not.toContain("/reset");
	});

	it("adds liquidate hint for live portfolios when requested", () => {
		const withHint = formatPortfolioSummary(sampleSummary, {
			includeLiquidateHint: true,
		});

		expect(withHint).toContain("/liquidate");
		expect(withHint).not.toContain("/reset");
	});

	it("shows combined USD total and per-asset performance lines", () => {
		const text = formatPortfolioSummary({
			...sampleSummary,
			holdings: { USDC: 85.18, LINK: 0.73, SOL: 0.12 },
			startingUsdValue: 100,
			currentUsdValue: 100.08,
			assetPerformances: [
				{ symbol: "LINK", usdValue: 21, returnPct: 0.1 },
				{ symbol: "SOL", usdValue: 18.5, returnPct: -0.25 },
			],
		});

		expect(text).toContain("LINK: *$21\\.00* \\(*\\+0\\.10%*\\)");
		expect(text).toContain("SOL: *$18\\.50* \\(*\\-0\\.25%*\\)");
		expect(text).toContain("Total USD Value: *$100\\.08* \\(*\\+0\\.08%*\\)");
		expect(text).not.toContain("All\\-time:");
	});

	it("shows only USD total when accumulating a USD stablecoin", () => {
		const text = formatPortfolioSummary({
			...sampleSummary,
			accumulateSymbol: "USDC",
			accumulateValue: 10_500,
			startingAccumulateValue: 10_000,
		});

		expect(text).toContain("Total USD Value: *$10,500\\.00*");
		expect(text).not.toMatch(/__Performance:__[\s\S]*USDC: \*/);
	});
});

describe("parsePortfolioModeCallback", () => {
	it("parses mode callback data", () => {
		expect(parsePortfolioModeCallback(portfolioModeCallbackData("paper"))).toBe(
			"paper",
		);
		expect(parsePortfolioModeCallback(portfolioModeCallbackData("live"))).toBe(
			"live",
		);
		expect(parsePortfolioModeCallback("other")).toBeUndefined();
	});
});

describe("handleBotMessage onboarding", () => {
	const newUserContext: BotHandlerContext = {
		onboardingState: "awaiting_mode_selection",
		onboardingDraftJson: null,
		hasActivePortfolio: false,
		settings: DEFAULT_TELEGRAM_USER_SETTINGS,
	};

	it("prompts for mode on /start for new user", () => {
		const result = handleBotMessage(newUserContext, {
			kind: "command",
			command: "start",
		});

		expect(result.text).toContain("Choose how you want to trade");
		expect(result.replyMarkup?.inline_keyboard).toHaveLength(2);
		expect(result.effects?.userPatch?.onboardingState).toBe(
			"awaiting_mode_selection",
		);
	});

	it("advances to starting value after paper mode", () => {
		const result = handleBotMessage(newUserContext, {
			kind: "callback",
			data: portfolioModeCallbackData("paper"),
		});

		expect(result.text).toContain("starting value");
		expect(result.effects?.userPatch?.onboardingState).toBe(
			"awaiting_starting_value",
		);
	});

	it("creates paper portfolio after valid starting value", () => {
		const paperContext: BotHandlerContext = {
			...newUserContext,
			onboardingState: "awaiting_starting_value",
		};
		const result = handleBotMessage(paperContext, {
			kind: "text",
			text: "15000",
		});

		expect(result.text).toContain("paper portfolio is ready");
		expect(result.effects?.createPortfolio).toEqual({
			startingValueUsd: 15_000,
			riskTolerance: "medium",
		});
		expect(result.effects?.userPatch?.onboardingState).toBeNull();
	});

	it("uses default starting value via Default button", () => {
		const paperContext: BotHandlerContext = {
			...newUserContext,
			onboardingState: "awaiting_starting_value",
		};
		const result = handleBotMessage(paperContext, {
			kind: "callback",
			data: STARTING_VALUE_DEFAULT_CALLBACK,
		});

		expect(result.effects?.createPortfolio).toEqual({
			startingValueUsd: 10_000,
			riskTolerance: "medium",
		});
		expect(result.effects?.userPatch?.onboardingState).toBeNull();
	});

	it("completes paper onboarding on risk callback", () => {
		const riskContext: BotHandlerContext = {
			onboardingState: "awaiting_risk_tolerance",
			onboardingDraftJson: serializeOnboardingDraft({
				mode: "paper",
				startingValueUsd: 10_000,
			}),
			hasActivePortfolio: false,
			settings: DEFAULT_TELEGRAM_USER_SETTINGS,
		};

		const result = handleBotMessage(riskContext, {
			kind: "callback",
			data: riskToleranceCallbackData("low"),
		});

		expect(result.text).toContain("paper portfolio is ready");
		expect(result.effects?.createPortfolio).toEqual({
			startingValueUsd: 10_000,
			riskTolerance: "low",
		});
		expect(result.effects?.userPatch?.onboardingState).toBeNull();
	});

	it("starts live wallet creation when live mode selected", () => {
		const result = handleBotMessage(
			newUserContext,
			{
				kind: "callback",
				data: portfolioModeCallbackData("live"),
			},
			undefined,
			{ liveTradingConfigured: true },
		);

		expect(result.effects?.createLivePortfolio).toBe(true);
		expect(result.effects?.userPatch?.onboardingState).toBe(
			"awaiting_live_deposit",
		);
	});

	it("/reset deactivates portfolio without starting onboarding", () => {
		const result = handleBotMessage(onboardedContext, {
			kind: "command",
			command: "reset",
		});

		expect(result.effects?.deactivatePortfolios).toBe(true);
		expect(result.effects?.userPatch?.onboardingState).toBeNull();
		expect(result.text).toContain("deactivated");
		expect(result.text).toContain("/start");
		expect(result.text).not.toContain("Choose how you want to trade");
	});

	it("/reset is rejected for live portfolios", () => {
		const result = handleBotMessage(
			{
				...onboardedContext,
				activePortfolio: {
					id: 1,
					mode: "live",
					fundingStatus: "funded",
					walletAddress: "0x1111111111111111111111111111111111111111",
					minDepositUsd: 1000,
					totalDepositedUsd: 1000,
					totalWithdrawnUsd: 0,
				},
			},
			{ kind: "command", command: "reset" },
		);

		expect(result.effects?.deactivatePortfolios).toBeUndefined();
		expect(result.text).toContain("/liquidate");
	});

	it("/liquidate starts address collection for funded live portfolios", () => {
		const result = handleBotMessage(
			{
				...onboardedContext,
				activePortfolio: {
					id: 1,
					mode: "live",
					fundingStatus: "funded",
					walletAddress: "0x1111111111111111111111111111111111111111",
					minDepositUsd: 1000,
					totalDepositedUsd: 1000,
					totalWithdrawnUsd: 0,
				},
			},
			{ kind: "command", command: "liquidate" },
			undefined,
			{ liquidationConfigured: true },
		);

		expect(result.effects?.userPatch?.onboardingState).toBe(
			"awaiting_liquidate_address",
		);
		expect(result.text).toContain("0x");
	});
});

describe("handleBotMessage summary commands", () => {
	it("/start shows summary with reset hint for onboarded paper user", () => {
		const result = handleBotMessage(
			onboardedContext,
			{ kind: "command", command: "start" },
			sampleSummary,
		);

		expect(result.text).toContain("Portfolio summary");
		expect(result.text).toContain("/reset");
	});

	it("/start shows liquidate hint for live user", () => {
		const result = handleBotMessage(
			{
				...onboardedContext,
				activePortfolio: {
					id: 1,
					mode: "live",
					fundingStatus: "funded",
					walletAddress: "0x1111111111111111111111111111111111111111",
					minDepositUsd: 1000,
					totalDepositedUsd: 1000,
					totalWithdrawnUsd: 0,
				},
			},
			{ kind: "command", command: "start" },
			sampleSummary,
		);

		expect(result.text).toContain("/liquidate");
		expect(result.text).not.toContain("/reset");
	});

	it("/status and /summary show summary without reset hint", () => {
		for (const command of ["status", "summary"] as const) {
			const result = handleBotMessage(
				onboardedContext,
				{ kind: "command", command },
				sampleSummary,
			);

			expect(result.text).toContain("Portfolio summary");
			expect(result.text).not.toContain("/reset");
		}
	});

	it("/status without portfolio prompts /start", () => {
		const result = handleBotMessage(
			{
				onboardingState: null,
				onboardingDraftJson: null,
				hasActivePortfolio: false,
				settings: DEFAULT_TELEGRAM_USER_SETTINGS,
			},
			{ kind: "command", command: "status" },
		);

		expect(result.text).toContain("/start");
	});
});

describe("handleBotMessage settings", () => {
	it("shows settings with toggle keyboard on /settings", () => {
		const result = handleBotMessage(onboardedContext, {
			kind: "command",
			command: "settings",
		});

		expect(result.text).toContain("Settings");
		expect(result.text).toContain("Verbose hourly reports");
		expect(result.replyMarkup?.inline_keyboard[0]?.[0]?.text).toContain(
			"Verbose: OFF",
		);
	});

	it("updates verbose via /settings verbose=true", () => {
		const result = handleBotMessage(onboardedContext, {
			kind: "command",
			command: "settings",
			args: "verbose=true",
		});

		expect(result.effects?.settingsPatch).toEqual({ verbose: true });
		expect(result.text).toContain("ON");
	});
});

describe("handleBotMessage portfolio", () => {
	it("shows portfolio settings on /portfolio", () => {
		const result = handleBotMessage(
			onboardedContext,
			{ kind: "command", command: "portfolio" },
			sampleSummary,
		);

		expect(result.text).toContain("Portfolio Settings");
		expect(result.text).toContain("Risk tolerance");
	});

	it("shows risk buttons on /portfolio risk", () => {
		const result = handleBotMessage(
			onboardedContext,
			{ kind: "command", command: "portfolio", args: "risk" },
			sampleSummary,
		);

		expect(result.text).toContain("Portfolio risk tolerance");
		expect(result.replyMarkup?.inline_keyboard).toHaveLength(4);
	});

	it("updates risk via /portfolio risk=high", () => {
		const result = handleBotMessage(
			{
				...onboardedContext,
				activePortfolio: {
					id: 7,
					mode: "paper",
					fundingStatus: "funded",
					walletAddress: null,
					minDepositUsd: 0,
					totalDepositedUsd: 0,
					totalWithdrawnUsd: 0,
				},
			},
			{ kind: "command", command: "portfolio", args: "risk=high" },
			sampleSummary,
		);

		expect(result.effects?.portfolioPatch).toEqual({
			portfolioId: 7,
			riskSetting: "high",
		});
		expect(result.text).toContain("0\\.6");
	});

	it("updates custom risk via /portfolio risk=0.5", () => {
		const result = handleBotMessage(
			{
				...onboardedContext,
				activePortfolio: {
					id: 7,
					mode: "paper",
					fundingStatus: "funded",
					walletAddress: null,
					minDepositUsd: 0,
					totalDepositedUsd: 0,
					totalWithdrawnUsd: 0,
				},
			},
			{ kind: "command", command: "portfolio", args: "risk=0.5" },
			sampleSummary,
		);

		expect(result.effects?.portfolioPatch).toEqual({
			portfolioId: 7,
			riskSetting: "0.5",
		});
		expect(result.text).toContain("0\\.5");
	});
});

describe("handleBotMessage status nav", () => {
	it("asks for confirmation before closing a live portfolio from nav", () => {
		const result = handleBotMessage(
			{
				...onboardedContext,
				activePortfolio: {
					id: 3,
					mode: "live",
					fundingStatus: "funded",
					walletAddress: "0xabc",
					minDepositUsd: 100,
					totalDepositedUsd: 1000,
					totalWithdrawnUsd: 0,
				},
			},
			{ kind: "callback", data: "nav:liquidate" },
			sampleSummary,
			{ liquidationConfigured: true },
		);

		expect(result.text).toContain("Are you sure");
		expect(result.replyMarkup?.inline_keyboard[0]?.[0]?.style).toBe("danger");
	});

	it("starts liquidation after nav confirmation", () => {
		const result = handleBotMessage(
			{
				...onboardedContext,
				activePortfolio: {
					id: 3,
					mode: "live",
					fundingStatus: "funded",
					walletAddress: "0xabc",
					minDepositUsd: 100,
					totalDepositedUsd: 1000,
					totalWithdrawnUsd: 0,
				},
			},
			{ kind: "callback", data: "nav:liquidate_confirm" },
			sampleSummary,
			{ liquidationConfigured: true },
		);

		expect(result.effects?.userPatch?.onboardingState).toBe(
			"awaiting_liquidate_address",
		);
	});

	it("asks for confirmation before closing a paper portfolio from nav", () => {
		const result = handleBotMessage(
			onboardedContext,
			{ kind: "callback", data: "nav:reset" },
			sampleSummary,
		);

		expect(result.text).toContain("Are you sure");
		expect(result.replyMarkup?.inline_keyboard[0]?.[0]?.callback_data).toBe(
			"nav:reset_confirm",
		);
	});

	it("resets a paper portfolio after nav confirmation", () => {
		const result = handleBotMessage(
			onboardedContext,
			{ kind: "callback", data: "nav:reset_confirm" },
			sampleSummary,
		);

		expect(result.effects?.deactivatePortfolios).toBe(true);
	});
});
