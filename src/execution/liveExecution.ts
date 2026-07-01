import { assertSupportedDepositChainId } from "@/config/chainAssets.js";
import type { AppConfig } from "@/config/index.js";
import type { OutlookThresholds } from "@/execution/outlookActions.js";
import { planAndValidateTrades } from "@/execution/planAndValidateTrades.js";
import type { PlannedFill } from "@/execution/planTrades.js";
import { settleFill } from "@/execution/settleFill.js";
import type {
	ExecuteRecommendationInput,
	ExecutionEngine,
	ExecutionResult,
} from "@/execution/types.js";
import type { CdpGasPaymentMode } from "@/live/cdpPaymaster.js";
import { executeLiveSwap } from "@/live/dex/executeLiveSwap.js";
import { findPortfolioWalletCredentials } from "@/live/portfolioWalletCredentials.js";
import {
	resolveSyncAssets,
	syncPortfolioHoldingsFromChain,
} from "@/live/syncChainHoldings.js";
import {
	decryptPrivateKey,
	parseWalletEncryptionKey,
} from "@/live/walletEncryption.js";
import type { StoredTrade } from "@/schemas/Trade.js";
import type { AppDatabase } from "@/storage/db.js";
import {
	findPortfolioById,
	type StoredPortfolio,
} from "@/storage/repositories/portfolioRepository.js";

export type LiveExecutionConfig = {
	tradeableSymbols: readonly string[];
	outlookThresholds: OutlookThresholds;
	zeroXApiKey: string;
	walletEncryptionKey: string;
	rpcUrl: string;
	chainId: number;
	maxSlippageBps: number;
	gasBootstrapUsd: number;
	assets: AppConfig["assetTradeable"];
	cdpPaymasterRpcUrl?: string;
	cdpGasPaymentMode: CdpGasPaymentMode;
	maxRiskOnFraction: number;
};

export function createLiveExecutionConfig(
	config: AppConfig,
): LiveExecutionConfig | undefined {
	if (!config.live.zeroXApiKey || !config.live.walletEncryptionKey) {
		return undefined;
	}

	return {
		tradeableSymbols: config.assetTradeable.map((asset) => asset.symbol),
		outlookThresholds: config.outlookThresholds,
		zeroXApiKey: config.live.zeroXApiKey,
		walletEncryptionKey: config.live.walletEncryptionKey,
		rpcUrl: config.live.depositRpcUrl,
		chainId: config.live.depositChainId,
		maxSlippageBps: config.live.maxSlippageBps,
		gasBootstrapUsd: config.live.gasBootstrapUsd,
		assets: config.assetTradeable,
		maxRiskOnFraction: config.riskGuardrails.maxRiskOnFraction,
		cdpGasPaymentMode: config.live.cdpGasPaymentMode,
		...(config.live.cdpPaymasterRpcUrl
			? { cdpPaymasterRpcUrl: config.live.cdpPaymasterRpcUrl }
			: {}),
	};
}

function toExecutedFill(
	fill: PlannedFill,
	swap: Awaited<ReturnType<typeof executeLiveSwap>>,
): PlannedFill {
	if (fill.side === "buy") {
		return {
			side: fill.side,
			symbol: fill.symbol,
			quantity: swap.buyAmount,
			priceUsd: swap.sellAmount / swap.buyAmount,
		};
	}

	return {
		side: fill.side,
		symbol: fill.symbol,
		quantity: swap.sellAmount,
		priceUsd: swap.buyAmount / swap.sellAmount,
	};
}

export class LiveExecution implements ExecutionEngine {
	constructor(
		private readonly db: AppDatabase,
		private readonly config: LiveExecutionConfig,
		private readonly fetchImpl: typeof fetch = fetch,
	) {}

	async executeRecommendation(
		input: ExecuteRecommendationInput,
	): Promise<ExecutionResult> {
		if (!input.portfolio) {
			return {
				executed: false,
				reason: "No portfolio provided",
				trades: [],
			};
		}

		return this.executeForPortfolio(input.portfolio, input);
	}

	async executeForPortfolio(
		portfolio: StoredPortfolio,
		input: ExecuteRecommendationInput,
	): Promise<ExecutionResult> {
		if (portfolio.mode !== "live") {
			return {
				executed: false,
				reason: "Portfolio is not in live mode",
				trades: [],
			};
		}

		const credentials = await findPortfolioWalletCredentials(
			this.db,
			portfolio.id,
		);
		if (!credentials) {
			return {
				executed: false,
				reason: "Live portfolio wallet credentials are missing",
				trades: [],
			};
		}

		const chainId = assertSupportedDepositChainId(credentials.chainId);
		const syncAssets = resolveSyncAssets(this.config.assets, chainId);

		await syncPortfolioHoldingsFromChain(
			this.db,
			{
				portfolioId: portfolio.id,
				walletAddress: credentials.walletAddress,
				chainId,
				rpcUrl: this.config.rpcUrl,
				assets: syncAssets,
			},
			this.fetchImpl,
		);

		const refreshed =
			(await findPortfolioById(this.db, portfolio.id)) ?? portfolio;

		const planned = planAndValidateTrades({
			portfolio: refreshed,
			recommendation: input.recommendation,
			marketSnapshots: input.marketSnapshots,
			tradeableSymbols: this.config.tradeableSymbols,
			outlookThresholds: this.config.outlookThresholds,
			maxRiskOnFraction: this.config.maxRiskOnFraction,
		});

		if (!planned.ok) {
			return {
				executed: false,
				reason: planned.reason,
				trades: [],
				...(planned.riskBlocked ? { riskBlocked: true } : {}),
			};
		}

		const encryptionKey = parseWalletEncryptionKey(
			this.config.walletEncryptionKey,
		);
		const privateKey = decryptPrivateKey(
			credentials.encryptedPrivateKey,
			encryptionKey,
		);

		const trades: StoredTrade[] = [];

		for (const fill of planned.fills) {
			const swap = await executeLiveSwap(
				{
					fill,
					cashSymbol: refreshed.cashSymbol,
					chainId,
					walletAddress: credentials.walletAddress,
					walletKind: credentials.walletKind,
					privateKey,
					rpcUrl: this.config.rpcUrl,
					zeroXApiKey: this.config.zeroXApiKey,
					maxSlippageBps: this.config.maxSlippageBps,
					assets: this.config.assets,
					gasBootstrapUsd: this.config.gasBootstrapUsd,
					cdpGasPaymentMode: this.config.cdpGasPaymentMode,
					...(this.config.cdpPaymasterRpcUrl
						? { cdpPaymasterRpcUrl: this.config.cdpPaymasterRpcUrl }
						: {}),
				},
				this.fetchImpl,
			);

			const executedFill = toExecutedFill(fill, swap);
			const settled = await settleFill(
				this.db,
				refreshed.id,
				executedFill,
				refreshed.cashSymbol,
				input.decisionId,
				{ txHash: swap.txHash },
			);
			trades.push(...settled);
		}

		return {
			executed: true,
			reason: `Executed ${planned.fills.length} live swap(s)`,
			trades,
		};
	}
}
