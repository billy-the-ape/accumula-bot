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
	holdings: { USDC: 10_000 },
	startingUsdValue: 10_000,
	currentUsdValue: 10_500,
	accumulateValue: 0.1,
	startingAccumulateValue: 0.095,
	allTimeReturnPct: 5.26,
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
		expect(parseBotCommand("/settings")).toBe("settings");
		expect(parseBotCommand("/decision")).toBe("decision");
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
});

describe("handleBotMessage onboarding", () => {
	const newUserContext: BotHandlerContext = {
		onboardingState: "awaiting_starting_value",
		onboardingDraftJson: null,
		hasActivePortfolio: false,
		settings: DEFAULT_TELEGRAM_USER_SETTINGS,
	};

	it("prompts for starting value on /start for new user", () => {
		const result = handleBotMessage(newUserContext, {
			kind: "command",
			command: "start",
		});

		expect(result.text).toContain("initial starting value");
		expect(result.replyMarkup?.inline_keyboard[0]?.[0]?.text).toBe("Default");
		expect(result.effects?.userPatch?.onboardingState).toBe(
			"awaiting_starting_value",
		);
	});

	it("advances to risk tolerance after valid starting value", () => {
		const result = handleBotMessage(newUserContext, {
			kind: "text",
			text: "15000",
		});

		expect(result.text).toContain("risk tolerance");
		expect(result.replyMarkup?.inline_keyboard).toHaveLength(3);
		expect(result.effects?.userPatch?.onboardingState).toBe(
			"awaiting_risk_tolerance",
		);
		expect(
			parseOnboardingDraft(
				result.effects?.userPatch?.onboardingDraftJson ?? null,
			),
		).toEqual({
			startingValueUsd: 15_000,
		});
	});

	it("uses default starting value via Default button", () => {
		const result = handleBotMessage(newUserContext, {
			kind: "callback",
			data: STARTING_VALUE_DEFAULT_CALLBACK,
		});

		expect(result.effects?.userPatch?.onboardingState).toBe(
			"awaiting_risk_tolerance",
		);
		expect(
			parseOnboardingDraft(
				result.effects?.userPatch?.onboardingDraftJson ?? null,
			)?.startingValueUsd,
		).toBe(10_000);
	});

	it("completes onboarding on risk callback", () => {
		const riskContext: BotHandlerContext = {
			onboardingState: "awaiting_risk_tolerance",
			onboardingDraftJson: serializeOnboardingDraft({
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

	it("/reset deactivates and restarts onboarding", () => {
		const result = handleBotMessage(onboardedContext, {
			kind: "command",
			command: "reset",
		});

		expect(result.effects?.deactivatePortfolios).toBe(true);
		expect(result.effects?.userPatch?.onboardingState).toBe(
			"awaiting_starting_value",
		);
		expect(result.text).toContain("initial starting value");
	});
});

describe("handleBotMessage summary commands", () => {
	it("/start shows summary with reset hint for onboarded user", () => {
		const result = handleBotMessage(
			onboardedContext,
			{ kind: "command", command: "start" },
			sampleSummary,
		);

		expect(result.text).toContain("Portfolio summary");
		expect(result.text).toContain("/reset");
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
		expect(result.text).toContain("true");
	});
});
