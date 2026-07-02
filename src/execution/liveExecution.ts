import type { CoinGeckoConfig } from "@/config/appConfigSchema.js";
import { assertSupportedDepositChainId } from "@/config/chainAssets.js";
import type { AppConfig } from "@/config/index.js";
import type { OutlookThresholds } from "@/execution/outlookActions.js";
import { planAndValidateTrades } from "@/execution/planAndValidateTrades.js";
import type { PlannedFill } from "@/execution/planTrades.js";
import { repricePlannedFill } from "@/execution/repricePlannedFill.js";
import { settleFill } from "@/execution/settleFill.js";
import type {
	ExecuteRecommendationInput,
	ExecutionEngine,
	ExecutionResult,
} from "@/execution/types.js";
import type { CdpGasPaymentMode } from "@/live/cdpPaymaster.js";
import { executeLiveSwap, LiveSwapError } from "@/live/dex/executeLiveSwap.js";
import { findPortfolioWalletCredentials } from "@/live/portfolioWalletCredentials.js";
import {
	resolveSyncAssets,
	syncPortfolioHoldingsFromChain,
} from "@/live/syncChainHoldings.js";
import {
	decryptPrivateKey,
	parseWalletEncryptionKey,
} from "@/live/walletEncryption.js";
import { getAnalyzableAssets } from "@/llm/prompt.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";
import type { MarketSnapshot } from "@/schemas/MarketSnapshot.js";
import type { StoredTrade } from "@/schemas/Trade.js";
import { fetchMarketSnapshots } from "@/sources/market/fetchMarketSnapshots.js";
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
	analyzableAssets: Cryptocurrency[];
	coingecko: CoinGeckoConfig;
	cdpPaymasterRpcUrl?: string;
	cdpGasPolicyId?: string;
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
		analyzableAssets: getAnalyzableAssets(config),
		coingecko: config.coingecko,
		maxRiskOnFraction: config.riskGuardrails.maxRiskOnFraction,
		cdpGasPaymentMode: config.live.cdpGasPaymentMode,
		...(config.live.cdpPaymasterRpcUrl
			? { cdpPaymasterRpcUrl: config.live.cdpPaymasterRpcUrl }
			: {}),
		...(config.live.cdpGasPolicyId
			? { cdpGasPolicyId: config.live.cdpGasPolicyId }
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
		private readonly fetchMarketSnapshotsImpl: typeof fetchMarketSnapshots = fetchMarketSnapshots,
	) {}

	private async fetchFreshMarketSnapshots(): Promise<MarketSnapshot[]> {
		return this.fetchMarketSnapshotsImpl(this.config.analyzableAssets, {
			baseUrl: this.config.coingecko.baseUrl,
			...(this.config.coingecko.apiKey
				? { apiKey: this.config.coingecko.apiKey }
				: {}),
			fetchImpl: this.fetchImpl,
		});
	}

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

		const planningSnapshots = await this.fetchFreshMarketSnapshots();
		console.info(
			`Live execution: refreshed market snapshots for portfolio ${portfolio.id}`,
		);

		const planned = planAndValidateTrades({
			portfolio: refreshed,
			recommendation: input.recommendation,
			marketSnapshots: planningSnapshots,
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
			try {
				const swapSnapshots = await this.fetchFreshMarketSnapshots();
				const repricedFill = repricePlannedFill(
					fill,
					swapSnapshots,
					refreshed.cashSymbol,
					refreshed.assetToAccumulate,
				);

				const swap = await executeLiveSwap(
					{
						fill: repricedFill,
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
						...(this.config.cdpGasPolicyId
							? { cdpGasPolicyId: this.config.cdpGasPolicyId }
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
			} catch (error) {
				const message =
					error instanceof LiveSwapError || error instanceof Error
						? error.message
						: "unknown error";

				if (trades.length > 0) {
					return {
						executed: true,
						reason:
							`Partial live execution: ${trades.length}/${planned.fills.length} swap(s) completed; ` +
							`failed on ${fill.symbol} ${fill.side}: ${message}`,
						trades,
					};
				}

				return {
					executed: false,
					reason: `Live swap failed for ${fill.symbol} ${fill.side}: ${message}`,
					trades: [],
				};
			}
		}

		return {
			executed: true,
			reason: `Executed ${planned.fills.length} live swap(s)`,
			trades,
		};
	}
}
