import {
	assertSupportedDepositChainId,
	getChainEvmMetadata,
	type SupportedDepositChainId,
} from "@/config/chainAssets.js";
import type { PlannedFill } from "@/execution/planTrades.js";
import type { CdpGasPaymentMode } from "@/live/cdpPaymaster.js";
import {
	fetchNativeEthBalance,
	MIN_NATIVE_ETH_FOR_SWAP,
} from "@/live/dex/liveWallet.js";
import {
	fromTokenUnits,
	toTokenUnits,
	truncateToTokenDecimals,
} from "@/live/dex/tokenAmounts.js";
import {
	fetchZeroXQuote,
	ZeroXApiError,
	type ZeroXQuote,
} from "@/live/dex/zeroXClient.js";
import {
	buildApproveCallIfNeeded,
	buildPortfolioTransactionContext,
	type PortfolioContractCall,
	type PortfolioTransactionContext,
	sendPortfolioContractCalls,
} from "@/live/portfolioTransactionSender.js";
import type { PortfolioWalletKind } from "@/live/portfolioWalletKind.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";

export type ExecuteLiveSwapInput = {
	fill: PlannedFill;
	cashSymbol: string;
	chainId: SupportedDepositChainId;
	walletAddress: `0x${string}`;
	walletKind: PortfolioWalletKind;
	privateKey: `0x${string}`;
	rpcUrl: string;
	zeroXApiKey: string;
	maxSlippageBps: number;
	assets: readonly Cryptocurrency[];
	gasBootstrapUsd: number;
	cdpPaymasterRpcUrl?: string;
	cdpGasPolicyId?: string;
	cdpGasPaymentMode?: CdpGasPaymentMode;
};

export type ExecuteLiveSwapResult = {
	txHash: `0x${string}`;
	buyAmount: number;
	sellAmount: number;
	buySymbol: string;
	sellSymbol: string;
};

export class LiveSwapError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LiveSwapError";
	}
}

export const LIVE_SWAP_QUOTE_ATTEMPTS = 3;
export const LIVE_SWAP_QUOTE_RETRY_DELAY_MS = 3_000;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function formatTokenAmount(amount: bigint): string {
	return amount.toString();
}

function logQuoteDetails(params: {
	fill: PlannedFill;
	legs: {
		sellSymbol: string;
		buySymbol: string;
		buyDecimals: number;
		sellDecimals: number;
		expectedBuyAmount: bigint;
	};
	quote: ZeroXQuote;
	maxSlippageBps: number;
}): void {
	const buyAmount = fromTokenUnits(
		params.quote.buyAmount,
		params.legs.buyDecimals,
	);
	const sellAmount = fromTokenUnits(
		params.quote.sellAmount,
		params.legs.sellDecimals,
	);
	const impliedPriceUsd = sellAmount / buyAmount;
	const referencePriceUsd = params.fill.priceUsd;
	const driftPct =
		((impliedPriceUsd - referencePriceUsd) / referencePriceUsd) * 100;
	console.info(
		`Live swap quote for ${params.fill.symbol} ${params.fill.side}: ` +
			`sell ${sellAmount} ${params.legs.sellSymbol}, buy ${buyAmount} ${params.legs.buySymbol}, ` +
			`implied $${impliedPriceUsd.toFixed(4)} vs reference $${referencePriceUsd.toFixed(4)} ` +
			`(${driftPct >= 0 ? "+" : ""}${driftPct.toFixed(2)}%), ` +
			`0x min buy ${formatTokenAmount(params.quote.minBuyAmount)} (${params.maxSlippageBps} bps slippage)`,
	);
}

function buildTransactionContext(
	input: ExecuteLiveSwapInput,
	chainId: SupportedDepositChainId,
): PortfolioTransactionContext {
	return buildPortfolioTransactionContext({
		walletKind: input.walletKind,
		walletAddress: input.walletAddress,
		ownerPrivateKey: input.privateKey,
		chainId,
		depositRpcUrl: input.rpcUrl,
		cashSymbol: input.cashSymbol,
		...(input.cdpPaymasterRpcUrl
			? { cdpPaymasterRpcUrl: input.cdpPaymasterRpcUrl }
			: {}),
		...(input.cdpGasPolicyId ? { cdpGasPolicyId: input.cdpGasPolicyId } : {}),
		...(input.cdpGasPaymentMode
			? { cdpGasPaymentMode: input.cdpGasPaymentMode }
			: {}),
	});
}

function resolveAssetEvm(
	symbol: string,
	chainId: SupportedDepositChainId,
	assets: readonly Cryptocurrency[],
) {
	const asset = assets.find((entry) => entry.symbol === symbol);
	if (asset?.evm && asset.evm.chainId === chainId) {
		return asset.evm;
	}

	const fallback = getChainEvmMetadata(
		symbol as Parameters<typeof getChainEvmMetadata>[0],
		chainId,
	);
	if (!fallback) {
		throw new LiveSwapError(
			`No EVM metadata for ${symbol} on chain ${chainId}`,
		);
	}
	return fallback;
}

function buildSwapLegs(
	fill: PlannedFill,
	cashSymbol: string,
	chainId: SupportedDepositChainId,
	assets: readonly Cryptocurrency[],
) {
	if (fill.symbol === cashSymbol) {
		throw new LiveSwapError("Cannot swap cash symbol directly");
	}

	const cashEvm = resolveAssetEvm(cashSymbol, chainId, assets);
	const assetEvm = resolveAssetEvm(fill.symbol, chainId, assets);

	if (fill.side === "buy") {
		const quoteUsd = fill.quantity * fill.priceUsd;
		const sellAmount = toTokenUnits(
			truncateToTokenDecimals(quoteUsd, cashEvm.decimals),
			cashEvm.decimals,
		);
		return {
			sellToken: cashEvm.contractAddress as `0x${string}`,
			buyToken: assetEvm.contractAddress as `0x${string}`,
			sellAmount,
			sellSymbol: cashSymbol,
			buySymbol: fill.symbol,
			expectedBuyAmount: toTokenUnits(
				truncateToTokenDecimals(fill.quantity, assetEvm.decimals),
				assetEvm.decimals,
			),
			buyDecimals: assetEvm.decimals,
			sellDecimals: cashEvm.decimals,
		};
	}

	const sellAmount = toTokenUnits(
		truncateToTokenDecimals(fill.quantity, assetEvm.decimals),
		assetEvm.decimals,
	);
	return {
		sellToken: assetEvm.contractAddress as `0x${string}`,
		buyToken: cashEvm.contractAddress as `0x${string}`,
		sellAmount,
		sellSymbol: fill.symbol,
		buySymbol: cashSymbol,
		expectedBuyAmount: toTokenUnits(
			truncateToTokenDecimals(fill.quantity * fill.priceUsd, cashEvm.decimals),
			cashEvm.decimals,
		),
		buyDecimals: cashEvm.decimals,
		sellDecimals: assetEvm.decimals,
	};
}

function buildCallsForQuote(
	quote: ZeroXQuote,
	sellToken: `0x${string}`,
): PortfolioContractCall[] {
	const calls: PortfolioContractCall[] = [];
	const approve = buildApproveCallIfNeeded({
		token: sellToken,
		spender: quote.allowanceSpender ?? "0x0",
		amount: quote.sellAmount,
		required: quote.allowanceRequired && quote.allowanceSpender !== undefined,
	});
	if (approve) {
		calls.push(approve);
	}
	calls.push({
		to: quote.transaction.to,
		data: quote.transaction.data,
		value: quote.transaction.value,
	});
	return calls;
}

async function submitZeroXQuote(
	quote: ZeroXQuote,
	context: PortfolioTransactionContext,
	sellToken: `0x${string}`,
): Promise<`0x${string}`> {
	return sendPortfolioContractCalls(
		context,
		buildCallsForQuote(quote, sellToken),
	);
}

async function ensureNativeGas(params: {
	input: ExecuteLiveSwapInput;
	context: PortfolioTransactionContext;
	fetchImpl: typeof fetch;
}) {
	if (params.input.walletKind === "smart_account") {
		return;
	}

	const ethBalance = await fetchNativeEthBalance(
		params.input.rpcUrl,
		params.input.walletAddress,
		params.fetchImpl,
	);
	if (ethBalance >= MIN_NATIVE_ETH_FOR_SWAP) {
		return;
	}

	const chainId = assertSupportedDepositChainId(params.input.chainId);
	const cashEvm = resolveAssetEvm(
		params.input.cashSymbol,
		chainId,
		params.input.assets,
	);
	const ethEvm = resolveAssetEvm("ETH", chainId, params.input.assets);
	const bootstrapAmount = toTokenUnits(
		truncateToTokenDecimals(params.input.gasBootstrapUsd, cashEvm.decimals),
		cashEvm.decimals,
	);

	const bootstrapQuote = await fetchZeroXQuote(
		{
			chainId,
			sellToken: cashEvm.contractAddress as `0x${string}`,
			buyToken: ethEvm.contractAddress as `0x${string}`,
			sellAmount: bootstrapAmount,
			taker: params.input.walletAddress,
			slippageBps: params.input.maxSlippageBps,
		},
		params.input.zeroXApiKey,
		params.fetchImpl,
	);

	await submitZeroXQuote(
		bootstrapQuote,
		params.context,
		cashEvm.contractAddress as `0x${string}`,
	);
}

export async function executeLiveSwap(
	input: ExecuteLiveSwapInput,
	fetchImpl: typeof fetch = fetch,
): Promise<ExecuteLiveSwapResult> {
	const chainId = assertSupportedDepositChainId(input.chainId);
	const legs = buildSwapLegs(
		input.fill,
		input.cashSymbol,
		chainId,
		input.assets,
	);
	const context = buildTransactionContext(input, chainId);

	await ensureNativeGas({ input, context, fetchImpl });

	let lastError: unknown;
	for (let attempt = 1; attempt <= LIVE_SWAP_QUOTE_ATTEMPTS; attempt++) {
		try {
			const quote = await fetchZeroXQuote(
				{
					chainId,
					sellToken: legs.sellToken,
					buyToken: legs.buyToken,
					sellAmount: legs.sellAmount,
					taker: input.walletAddress,
					slippageBps: input.maxSlippageBps,
				},
				input.zeroXApiKey,
				fetchImpl,
			);

			logQuoteDetails({
				fill: input.fill,
				legs,
				quote,
				maxSlippageBps: input.maxSlippageBps,
			});

			const txHash = await submitZeroXQuote(quote, context, legs.sellToken);

			return {
				txHash,
				buyAmount: fromTokenUnits(quote.buyAmount, legs.buyDecimals),
				sellAmount: fromTokenUnits(quote.sellAmount, legs.sellDecimals),
				buySymbol: legs.buySymbol,
				sellSymbol: legs.sellSymbol,
			};
		} catch (error) {
			lastError = error;
			const message = error instanceof Error ? error.message : "unknown error";
			console.warn(
				`Live swap quote failed for ${input.fill.symbol} ${input.fill.side} ` +
					`(attempt ${attempt}/${LIVE_SWAP_QUOTE_ATTEMPTS}): ${message}`,
			);

			if (attempt < LIVE_SWAP_QUOTE_ATTEMPTS) {
				console.info(
					`Retrying live swap quote for ${input.fill.symbol} ${input.fill.side} in ${LIVE_SWAP_QUOTE_RETRY_DELAY_MS}ms...`,
				);
				await delay(LIVE_SWAP_QUOTE_RETRY_DELAY_MS);
			}
		}
	}

	if (lastError instanceof LiveSwapError) {
		throw lastError;
	}
	if (lastError instanceof ZeroXApiError) {
		throw new LiveSwapError(
			`Swap quote failed for ${input.fill.symbol} ${input.fill.side} after ${LIVE_SWAP_QUOTE_ATTEMPTS} attempts: ${lastError.message}`,
		);
	}
	if (lastError instanceof Error) {
		throw new LiveSwapError(
			`Swap quote failed for ${input.fill.symbol} ${input.fill.side} after ${LIVE_SWAP_QUOTE_ATTEMPTS} attempts: ${lastError.message}`,
		);
	}
	throw new LiveSwapError(
		`Swap quote failed for ${input.fill.symbol} ${input.fill.side} after ${LIVE_SWAP_QUOTE_ATTEMPTS} attempts`,
	);
}
