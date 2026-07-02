import { DEFAULT_PAPER_STARTING_CASH_USD } from "@/execution/paperExecution.js";
import {
	bold,
	boldUnderline,
	code,
	escapeMarkdownV2,
	underline,
} from "@/notifications/telegram/escapeMarkdownV2.js";

/** Join lines as Telegram MarkdownV2 plain text (each line escaped). */
export function botPlainText(lines: string[]): string {
	return lines.map((line) => escapeMarkdownV2(line)).join("\n");
}

export function formatStartingValuePrompt(): string {
	return botPlainText([
		"Select your paper portfolio's initial starting value in USD:",
		`Tap Default for $${DEFAULT_PAPER_STARTING_CASH_USD.toLocaleString("en-US")}, or send a custom amount.`,
	]);
}

export function formatPortfolioModePrompt(): string {
	return (
		`🤖 ${boldUnderline("Welcome to Accumula Bot")} 🤖\n` +
		botPlainText([
			"",
			"Choose how you want to trade:",
			"• Paper — simulated portfolio with a starting cash balance",
			"• Live — real USDC on Base; we generate a deposit wallet for you",
		])
	);
}

export function formatLiveDepositInstructions(
	walletAddress: string,
	minDepositUsd: number,
): string {
	return [
		boldUnderline("Live portfolio — deposit USDC on Base"),
		"",
		escapeMarkdownV2("Your Portfolio Deposit Wallet:"),
		"",
		code(walletAddress),
		"",
		`${escapeMarkdownV2("• Send a ")}${bold("single transaction")}${escapeMarkdownV2(" with a minimum of ")}${bold(`$${minDepositUsd.toLocaleString("en-US")} USDC`)}\\.`,
		`${escapeMarkdownV2("• Only deposit ")}${bold("USDC on Base")}${escapeMarkdownV2(". Sending any other token or to another blockchain will be ")}${bold("lost forever")}\\.`,
		`${escapeMarkdownV2("• This deposit is only active for the next ")}${bold("30 minutes")}${escapeMarkdownV2(". If no deposits are made, portfolio will revert and you'll have to /start over again.")}`,
		escapeMarkdownV2(
			"• Upon withdrawal, WhalePilot will take a 12% carry fee of the total profit. If you liquidate your portfolio at a loss, you will not be charged a fee.",
		),
	].join("\n");
}

export function formatLiveDepositStatus(
	walletAddress: string,
	minDepositUsd: number,
	onChainUsdc: number,
): string {
	const lines = [
		formatLiveDepositInstructions(walletAddress, minDepositUsd),
		"",
		`On-chain USDC: $${bold(onDepositUsd(onChainUsdc))}`,
	];
	return lines.join("\n");
}

export function formatLiveDepositUnderMinimumMessage(
	onChainUsdc: number,
	minDepositUsd: number,
): string {
	return botPlainText([
		`Your deposit of $${onDepositUsd(onChainUsdc)} is below the $${minDepositUsd.toLocaleString("en-US")} minimum.`,
		"Liquidate this wallet and send the USDC back to your own address, then run /start to try again.",
	]);
}

export function formatLiveDepositSuccessMessage(depositUsd: number): string {
	return [
		escapeMarkdownV2("Your live portfolio is ready."),
		"",
		`Deposited: $${bold(depositUsd.toLocaleString("en-US"))}`,
		`Risk tolerance: ${bold("medium")}`,
		"",
		escapeMarkdownV2(
			"Trades run on the hourly schedule. Use /status or /summary anytime.",
		),
	].join("\n");
}

export function formatLiveDepositExpiredMessage(): string {
	return botPlainText([
		"The 30-minute deposit window expired with no qualifying deposit.",
		"Send /start to create a new portfolio.",
	]);
}

/** @deprecated use formatLiveDepositInstructions or formatLiveDepositStatus */
export function formatLiveDepositPrompt(
	walletAddress: string,
	minDepositUsd: number,
	onChainUsdc: number,
): string {
	if (onChainUsdc > 0) {
		return formatLiveDepositStatus(walletAddress, minDepositUsd, onChainUsdc);
	}
	return formatLiveDepositInstructions(walletAddress, minDepositUsd);
}

function onDepositUsd(value: number): string {
	return value.toLocaleString("en-US", {
		maximumFractionDigits: 2,
		minimumFractionDigits: 2,
	});
}

export function formatLivePortfolioCreatedMessage(
	depositUsd: number,
	riskTolerance: string,
): string {
	return [
		escapeMarkdownV2("Your live portfolio is ready."),
		"",
		`Deposited: $${bold(depositUsd.toLocaleString("en-US"))}`,
		`Risk tolerance: ${bold(riskTolerance)}`,
		"",
		escapeMarkdownV2(
			"Trades run on the hourly schedule. Use /status or /summary anytime.",
		),
	].join("\n");
}

export function formatPortfolioModeReminderMessage(): string {
	return botPlainText(["Please choose Paper or Live using the buttons below."]);
}

export function formatLiveDepositReminderMessage(): string {
	return botPlainText([
		"Waiting for your USDC deposit on Base. We'll notify you when it arrives.",
	]);
}

export function formatMissingWalletEncryptionKeyMessage(): string {
	return botPlainText([
		"Live trading is not configured on this server (missing WALLET_ENCRYPTION_KEY).",
		"Contact the operator or choose Paper mode.",
	]);
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
	"Send /reset to deactivate this portfolio. Use /start to create a new one.",
]);

export function formatPortfolioResetMessage(): string {
	return botPlainText([
		"Your portfolio has been deactivated.",
		"Send /start when you're ready to create a new one.",
	]);
}

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
	return botPlainText(["Send /start to create your portfolio."]);
}
