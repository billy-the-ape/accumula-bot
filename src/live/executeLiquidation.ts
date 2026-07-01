import { assertSupportedDepositChainId } from "@/config/chainAssets.js";
import type { AppConfig } from "@/config/index.js";
import { fetchErc20Balance } from "@/live/baseRpcClient.js";
import { computeLiquidationBreakdown } from "@/live/computeLiquidationBreakdown.js";
import { executeLiveSwap } from "@/live/dex/executeLiveSwap.js";
import {
	fetchNativeEthBalance,
	MIN_NATIVE_ETH_FOR_SWAP,
} from "@/live/dex/liveWallet.js";
import { buildErc20TransferCall } from "@/live/dex/transferErc20.js";
import {
	buildPortfolioTransactionContext,
	sendPortfolioContractCalls,
} from "@/live/portfolioTransactionSender.js";
import { findPortfolioWalletCredentials } from "@/live/portfolioWalletCredentials.js";
import {
	resolveSyncAssets,
	syncPortfolioHoldingsFromChain,
} from "@/live/syncChainHoldings.js";
import {
	decryptPrivateKey,
	parseWalletEncryptionKey,
} from "@/live/walletEncryption.js";
import type { AppDatabase } from "@/storage/db.js";
import {
	finalizeLiquidatedPortfolio,
	findPortfolioById,
	getPortfolioHoldings,
	setPortfolioTradingEnabled,
} from "@/storage/repositories/portfolioRepository.js";
import { recordWithdrawal } from "@/storage/repositories/withdrawalRepository.js";

const DUST_USD_TOLERANCE = 0.01;

export class LiquidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LiquidationError";
	}
}

export type ExecuteLiquidationInput = {
	portfolioId: number;
	destinationAddress: `0x${string}`;
};

export type ExecuteLiquidationResult = {
	grossUsdc: number;
	feeUsd: number;
	netToUserUsd: number;
	swapTxHashes: `0x${string}`[];
	feeTxHash?: `0x${string}`;
	netTxHash: `0x${string}`;
};

export function isLiquidationConfigured(config: AppConfig): boolean {
	return Boolean(
		config.live.zeroXApiKey &&
			config.live.walletEncryptionKey &&
			config.withdrawal.treasuryAddress,
	);
}

export async function executeLiquidation(
	db: AppDatabase,
	config: AppConfig,
	input: ExecuteLiquidationInput,
	fetchImpl: typeof fetch = fetch,
): Promise<ExecuteLiquidationResult> {
	if (!config.live.zeroXApiKey || !config.live.walletEncryptionKey) {
		throw new LiquidationError(
			"Live liquidation requires ZEROX_API_KEY and WALLET_ENCRYPTION_KEY",
		);
	}

	const treasuryAddress = config.withdrawal.treasuryAddress;
	if (!treasuryAddress) {
		throw new LiquidationError(
			"Live liquidation requires WITHDRAWAL_TREASURY_ADDRESS",
		);
	}

	const portfolio = await findPortfolioById(db, input.portfolioId);
	if (!portfolio?.isActive) {
		throw new LiquidationError("Active portfolio not found");
	}
	if (portfolio.mode !== "live" || portfolio.fundingStatus !== "funded") {
		throw new LiquidationError("Only funded live portfolios can be liquidated");
	}

	const credentials = await findPortfolioWalletCredentials(db, portfolio.id);
	if (!credentials) {
		throw new LiquidationError("Portfolio wallet credentials are missing");
	}

	const chainId = assertSupportedDepositChainId(credentials.chainId);
	await setPortfolioTradingEnabled(db, portfolio.id, false);

	try {
		await syncPortfolioHoldingsFromChain(
			db,
			{
				portfolioId: portfolio.id,
				walletAddress: credentials.walletAddress,
				chainId,
				rpcUrl: config.live.depositRpcUrl,
				assets: resolveSyncAssets(config.assetTradeable, chainId),
			},
			fetchImpl,
		);

		const holdings = await getPortfolioHoldings(db, portfolio.id);
		const cashSymbol = portfolio.cashSymbol;
		const encryptionKey = parseWalletEncryptionKey(
			config.live.walletEncryptionKey,
		);
		const privateKey = decryptPrivateKey(
			credentials.encryptedPrivateKey,
			encryptionKey,
		);

		const swapTxHashes: `0x${string}`[] = [];
		const swapInputBase = {
			cashSymbol,
			chainId,
			walletAddress: credentials.walletAddress,
			walletKind: credentials.walletKind,
			privateKey,
			rpcUrl: config.live.depositRpcUrl,
			zeroXApiKey: config.live.zeroXApiKey,
			maxSlippageBps: config.live.maxSlippageBps,
			assets: config.assetTradeable,
			gasBootstrapUsd: config.live.gasBootstrapUsd,
			cdpGasPaymentMode: config.live.cdpGasPaymentMode,
			...(config.live.cdpPaymasterRpcUrl
				? { cdpPaymasterRpcUrl: config.live.cdpPaymasterRpcUrl }
				: {}),
			...(config.live.cdpGasPolicyId
				? { cdpGasPolicyId: config.live.cdpGasPolicyId }
				: {}),
		};

		for (const [symbol, quantity] of Object.entries(holdings)) {
			if (symbol === cashSymbol || quantity <= 0) {
				continue;
			}

			const swap = await executeLiveSwap(
				{
					fill: {
						side: "sell",
						symbol,
						quantity,
						priceUsd: 1,
					},
					...swapInputBase,
				},
				fetchImpl,
			);
			swapTxHashes.push(swap.txHash);
		}

		const cashAsset = config.assetStarting;
		if (!cashAsset.evm || cashAsset.evm.chainId !== chainId) {
			throw new LiquidationError(
				`Cash asset ${cashSymbol} missing EVM metadata`,
			);
		}

		const grossUsdc = await fetchErc20Balance(
			{
				rpcUrl: config.live.depositRpcUrl,
				contractAddress: cashAsset.evm.contractAddress,
				walletAddress: credentials.walletAddress,
				decimals: cashAsset.evm.decimals,
			},
			fetchImpl,
		);

		const breakdown = computeLiquidationBreakdown({
			totalDepositedUsd: portfolio.totalDepositedUsd,
			totalWithdrawnUsd: portfolio.totalWithdrawnUsd,
			grossUsdc,
			profitFeeBps: config.withdrawal.profitFeeBps,
		});

		if (breakdown.netToUserUsd <= 0 && breakdown.feeUsd <= 0) {
			throw new LiquidationError("No USDC available to liquidate");
		}

		const txContext = buildPortfolioTransactionContext({
			walletKind: credentials.walletKind,
			walletAddress: credentials.walletAddress,
			ownerPrivateKey: privateKey,
			chainId,
			depositRpcUrl: config.live.depositRpcUrl,
			cashSymbol,
			cdpGasPaymentMode: config.live.cdpGasPaymentMode,
			...(config.live.cdpPaymasterRpcUrl
				? { cdpPaymasterRpcUrl: config.live.cdpPaymasterRpcUrl }
				: {}),
			...(config.live.cdpGasPolicyId
				? { cdpGasPolicyId: config.live.cdpGasPolicyId }
				: {}),
		});

		if (credentials.walletKind === "eoa") {
			const ethBalance = await fetchNativeEthBalance(
				config.live.depositRpcUrl,
				credentials.walletAddress,
				fetchImpl,
			);
			if (
				ethBalance < MIN_NATIVE_ETH_FOR_SWAP &&
				breakdown.feeUsd + breakdown.netToUserUsd > 0
			) {
				throw new LiquidationError(
					"Insufficient ETH for liquidation transfers after swaps",
				);
			}
		}

		const usdcToken = cashAsset.evm.contractAddress as `0x${string}`;
		let feeTxHash: `0x${string}` | undefined;
		let netTxHash: `0x${string}`;

		if (credentials.walletKind === "smart_account") {
			const transferCalls = [];
			if (breakdown.feeUsd > 0) {
				transferCalls.push(
					buildErc20TransferCall({
						token: usdcToken,
						to: treasuryAddress,
						amount: breakdown.feeUsd,
						decimals: cashAsset.evm.decimals,
					}),
				);
			}
			transferCalls.push(
				buildErc20TransferCall({
					token: usdcToken,
					to: input.destinationAddress,
					amount: breakdown.netToUserUsd,
					decimals: cashAsset.evm.decimals,
				}),
			);
			netTxHash = await sendPortfolioContractCalls(txContext, transferCalls);
			if (breakdown.feeUsd > 0) {
				feeTxHash = netTxHash;
			}
		} else {
			if (breakdown.feeUsd > 0) {
				feeTxHash = await sendPortfolioContractCalls(txContext, [
					buildErc20TransferCall({
						token: usdcToken,
						to: treasuryAddress,
						amount: breakdown.feeUsd,
						decimals: cashAsset.evm.decimals,
					}),
				]);
			}

			netTxHash = await sendPortfolioContractCalls(txContext, [
				buildErc20TransferCall({
					token: usdcToken,
					to: input.destinationAddress,
					amount: breakdown.netToUserUsd,
					decimals: cashAsset.evm.decimals,
				}),
			]);
		}

		const remainingUsdc = await fetchErc20Balance(
			{
				rpcUrl: config.live.depositRpcUrl,
				contractAddress: cashAsset.evm.contractAddress,
				walletAddress: credentials.walletAddress,
				decimals: cashAsset.evm.decimals,
			},
			fetchImpl,
		);
		if (remainingUsdc > DUST_USD_TOLERANCE) {
			throw new LiquidationError(
				`Wallet not fully emptied after liquidation (${remainingUsdc.toFixed(2)} USDC remaining)`,
			);
		}

		await recordWithdrawal(db, {
			portfolioId: portfolio.id,
			destinationAddress: input.destinationAddress,
			grossAmountUsd: breakdown.grossUsdc,
			feeAmountUsd: breakdown.feeUsd,
			netAmountUsd: breakdown.netToUserUsd,
			...(feeTxHash ? { feeTxHash } : {}),
			netTxHash,
		});

		await finalizeLiquidatedPortfolio(db, {
			portfolioId: portfolio.id,
			withdrawnUsd: breakdown.netToUserUsd,
		});

		return {
			grossUsdc: breakdown.grossUsdc,
			feeUsd: breakdown.feeUsd,
			netToUserUsd: breakdown.netToUserUsd,
			swapTxHashes,
			...(feeTxHash ? { feeTxHash } : {}),
			netTxHash,
		};
	} catch (error) {
		await setPortfolioTradingEnabled(db, portfolio.id, true);
		throw error;
	}
}
