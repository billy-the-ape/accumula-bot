import { DEFAULT_PAPER_STARTING_CASH_USD } from "@/execution/paperExecution.js";
import { escapeMarkdownV2 } from "@/notifications/telegram/escapeMarkdownV2.js";

/** Join lines as Telegram MarkdownV2 plain text (each line escaped). */
export function botPlainText(lines: string[]): string {
	return lines.map((line) => escapeMarkdownV2(line)).join("\n");
}

export function formatStartingValuePrompt(): string {
	return botPlainText([
		"Welcome to Accumula Bot!",
		"",
		"What is your starting portfolio value in USD?",
		`Default: $${DEFAULT_PAPER_STARTING_CASH_USD.toLocaleString("en-US")} — send /default to use it.`,
	]);
}

export function formatRiskTolerancePrompt(): string {
	return botPlainText([
		"Choose your risk tolerance:",
		"",
		"• Low — fewer trades; requires higher model confidence",
		"• Medium — balanced (default bar)",
		"• High — more trades; accepts lower confidence",
	]);
}

export function formatPortfolioCreatedMessage(
	startingValueUsd: number,
	riskTolerance: string,
): string {
	return botPlainText([
		"Your paper portfolio is ready.",
		"",
		`Starting value: $${startingValueUsd.toLocaleString("en-US")}`,
		`Risk tolerance: ${riskTolerance}`,
		"",
		"Trades run on the hourly schedule. Use /status or /summary anytime.",
	]);
}

export const NO_ACTIVE_PORTFOLIO_MESSAGE = botPlainText([
	"You don't have an active portfolio. Send /start to create one.",
]);

export const RESET_HINT = botPlainText([
	"Send /reset to deactivate this portfolio and set up a new one.",
]);

export function formatInvalidStartingValueMessage(): string {
	return botPlainText([
		"Please send a positive dollar amount (e.g. 10000) or /default for $10,000.",
	]);
}

export function formatStartingValueReminderMessage(): string {
	return botPlainText(["Please send a positive dollar amount or /default."]);
}

export function formatRiskToleranceReminderMessage(): string {
	return botPlainText([
		"Please choose Low, Medium, or High using the buttons below.",
	]);
}

export function formatUnknownRiskSelectionMessage(): string {
	return botPlainText([
		"Unknown selection. Please choose Low, Medium, or High.",
	]);
}

export function formatUnknownCommandMessage(): string {
	return botPlainText(["Unknown command. Try /status, /summary, or /reset."]);
}

export function formatSendStartMessage(): string {
	return botPlainText(["Send /start to create your paper portfolio."]);
}
