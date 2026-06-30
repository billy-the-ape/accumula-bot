import { DEFAULT_PAPER_STARTING_CASH_USD } from "@/execution/paperExecution.js";
import {
	bold,
	escapeMarkdownV2,
	underline,
} from "@/notifications/telegram/escapeMarkdownV2.js";

/** Join lines as Telegram MarkdownV2 plain text (each line escaped). */
export function botPlainText(lines: string[]): string {
	return lines.map((line) => escapeMarkdownV2(line)).join("\n");
}

export function formatStartingValuePrompt(): string {
	return (
		`🤖 ${underline("Welcome to Accumula Bot")} 🤖\n` +
		botPlainText([
			"",
			"To begin, select your portfolio's initial starting value in USD:",
			`Tap Default for $${DEFAULT_PAPER_STARTING_CASH_USD.toLocaleString("en-US")}, or send a custom amount.`,
		])
	);
}

export function formatRiskTolerancePrompt(startingValueUsd: number): string {
	return (
		`Starting value of $${bold(startingValueUsd.toLocaleString("en-US"))} selected\n` +
		botPlainText(["Now, choose your risk tolerance:", ""]) +
		[
			`• ${bold("Low")}: ${escapeMarkdownV2("fewer trades; requires higher model confidence")}`,
			`• ${bold("Medium")}: ${escapeMarkdownV2("balanced (default)")}`,
			`• ${bold("High")}: ${escapeMarkdownV2("more trades; accepts lower confidence")}`,
		].join("\n")
	);
}

export function formatPortfolioCreatedMessage(
	startingValueUsd: number,
	riskTolerance: string,
): string {
	return [
		escapeMarkdownV2("Your paper portfolio is ready."),
		"",
		`Starting value: $${bold(startingValueUsd.toLocaleString("en-US"))}`,
		`Risk tolerance: ${bold(riskTolerance)}`,
		"",
		escapeMarkdownV2(
			"Trades run on the hourly schedule. Use /status or /summary anytime.",
		),
	].join("\n");
}

export const NO_ACTIVE_PORTFOLIO_MESSAGE = botPlainText([
	"You don't have an active portfolio. Send /start to create one.",
]);

export const RESET_HINT = botPlainText([
	"Send /reset to deactivate this portfolio and set up a new one.",
]);

export function formatInvalidStartingValueMessage(): string {
	return botPlainText([
		"Please send a positive dollar amount (e.g. 10000) or tap Default.",
	]);
}

export function formatStartingValueReminderMessage(): string {
	return botPlainText(["Please tap Default or send a positive dollar amount."]);
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
