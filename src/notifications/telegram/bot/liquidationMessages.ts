import type { LiquidationBreakdown } from "@/live/computeLiquidationBreakdown.js";
import { botPlainText } from "@/notifications/telegram/bot/onboardingMessages.js";
import {
	bold,
	escapeMarkdownV2,
} from "@/notifications/telegram/escapeMarkdownV2.js";

function formatUsd(value: number): string {
	return value.toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

export function formatLiveResetRejectedMessage(): string {
	return botPlainText(["Use /liquidate to close your live portfolio."]);
}

export function formatMissingTreasuryAddressMessage(): string {
	return botPlainText([
		"Live liquidation is not configured on this bot.",
		"Contact the operator — WITHDRAWAL_TREASURY_ADDRESS is required.",
	]);
}

export function formatLiquidationAddressPrompt(): string {
	return botPlainText([
		"Send a Base wallet address (0x…) to receive your funds after liquidation.",
	]);
}

export function formatInvalidLiquidationAddressMessage(reason: string): string {
	return botPlainText([
		reason,
		"Please send a valid Base wallet address (0x…).",
	]);
}

export function formatLiquidationSameWalletMessage(): string {
	return botPlainText([
		"Destination address must differ from your portfolio deposit wallet.",
		"Send a different Base address to receive your funds.",
	]);
}

export function formatLiquidationInProgressMessage(): string {
	return botPlainText(["Liquidating portfolio… This may take a minute."]);
}

export function formatLiquidationCancelledMessage(): string {
	return botPlainText([
		"Liquidation cancelled.",
		"Your portfolio is unchanged.",
	]);
}

export function formatLiquidationSummaryMessage(params: {
	destinationAddress: string;
	estimatedGrossUsdc: number;
	breakdown: LiquidationBreakdown;
	profitFeeBps: number;
}): string {
	const feePct = (params.profitFeeBps / 100).toFixed(1);
	return [
		escapeMarkdownV2("Review liquidation"),
		"",
		`Destination: ${bold(params.destinationAddress)}`,
		`Estimated gross USDC: ${bold(formatUsd(params.estimatedGrossUsdc))}`,
		`Cost basis: ${bold(formatUsd(params.breakdown.costBasisUsd))}`,
		`Profit: ${bold(formatUsd(params.breakdown.profitUsd))}`,
		`Fee (${feePct}% of profit): ${bold(formatUsd(params.breakdown.feeUsd))}`,
		`Net to you: ${bold(formatUsd(params.breakdown.netToUserUsd))}`,
		"",
		escapeMarkdownV2(
			"Confirm to swap all holdings to USDC, send the fee to treasury, and transfer the remainder to your address.",
		),
	].join("\n");
}

export function formatLiquidationSuccessMessage(params: {
	netToUserUsd: number;
	feeUsd: number;
	netTxHash: string;
	feeTxHash?: string;
	swapCount: number;
}): string {
	const lines = [
		escapeMarkdownV2("Portfolio liquidated and closed."),
		"",
		`Net sent to you: ${bold(formatUsd(params.netToUserUsd))}`,
		`Profit fee: ${bold(formatUsd(params.feeUsd))}`,
		`Net tx: ${bold(params.netTxHash)}`,
	];
	if (params.feeTxHash) {
		lines.push(`Fee tx: ${bold(params.feeTxHash)}`);
	}
	if (params.swapCount > 0) {
		lines.push(`Swaps executed: ${bold(String(params.swapCount))}`);
	}
	lines.push(
		"",
		escapeMarkdownV2(
			"Send /start when you're ready to create a new portfolio.",
		),
	);
	return lines.join("\n");
}

export function formatLiquidationFailedMessage(error: string): string {
	return botPlainText([
		"Liquidation failed — your portfolio was left unchanged.",
		error,
		"Try again with /liquidate or contact support if the problem persists.",
	]);
}

export const LIQUIDATE_HINT = botPlainText([
	"Send /liquidate to close this live portfolio and withdraw your USDC.",
]);
