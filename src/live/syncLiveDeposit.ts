import type { AppConfig } from "@/config/appConfigSchema.js";
import { fetchErc20Balance } from "@/live/baseRpcClient.js";
import type { AppDatabase } from "@/storage/db.js";
import {
	findPortfolioById,
	markLivePortfolioFunded,
	type StoredPortfolio,
} from "@/storage/repositories/portfolioRepository.js";

export type LiveDepositStatus = "none" | "under_minimum" | "funded";

export type SyncLiveDepositResult = {
	portfolio: StoredPortfolio;
	onChainUsdc: number;
	depositStatus: LiveDepositStatus;
	/** @deprecated use depositStatus === "funded" */
	funded: boolean;
};

export async function syncLivePortfolioDeposit(
	db: AppDatabase,
	config: AppConfig,
	portfolioId: number,
	deps: { fetchImpl?: typeof fetch; dryRun?: boolean } = {},
): Promise<SyncLiveDepositResult | undefined> {
	const portfolio = await findPortfolioById(db, portfolioId);
	if (!portfolio) {
		return undefined;
	}
	if (
		portfolio.mode !== "live" ||
		portfolio.fundingStatus !== "awaiting_deposit"
	) {
		const onChainUsdc = portfolio.holdings[portfolio.cashSymbol] ?? 0;
		return {
			portfolio,
			onChainUsdc,
			depositStatus: portfolio.fundingStatus === "funded" ? "funded" : "none",
			funded: portfolio.fundingStatus === "funded",
		};
	}
	if (!portfolio.walletAddress) {
		throw new Error(`Live portfolio ${portfolioId} missing wallet address`);
	}

	const cashAsset =
		config.assetStarting.symbol === portfolio.cashSymbol
			? config.assetStarting
			: config.assetTradeable.find(
					(asset) => asset.symbol === portfolio.cashSymbol,
				);
	if (!cashAsset?.evm) {
		throw new Error(
			`${portfolio.cashSymbol} EVM metadata is not configured for chain ${config.live.depositChainId}`,
		);
	}

	const onChainUsdc = await fetchErc20Balance(
		{
			rpcUrl: config.live.depositRpcUrl,
			contractAddress: cashAsset.evm.contractAddress,
			walletAddress: portfolio.walletAddress,
			decimals: cashAsset.evm.decimals,
		},
		deps.fetchImpl,
	);

	const minDeposit = portfolio.minDepositUsd ?? config.live.minDepositUsd;
	if (onChainUsdc <= 0) {
		return {
			portfolio,
			onChainUsdc,
			depositStatus: "none",
			funded: false,
		};
	}
	if (onChainUsdc < minDeposit) {
		return {
			portfolio,
			onChainUsdc,
			depositStatus: "under_minimum",
			funded: false,
		};
	}

	if (deps.dryRun) {
		return {
			portfolio,
			onChainUsdc,
			depositStatus: "funded",
			funded: false,
		};
	}

	const updated = await markLivePortfolioFunded(db, {
		portfolioId,
		depositUsd: onChainUsdc,
		cashSymbol: portfolio.cashSymbol,
		assetToAccumulate: portfolio.assetToAccumulate,
		chainId: portfolio.chainId ?? config.live.depositChainId,
	});

	return {
		portfolio: updated,
		onChainUsdc,
		depositStatus: "funded",
		funded: true,
	};
}
