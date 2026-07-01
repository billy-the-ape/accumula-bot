import { eq } from "drizzle-orm";
import type { SupportedDepositChainId } from "@/config/chainAssets.js";
import { fetchErc20Balance } from "@/live/baseRpcClient.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";
import type { AppDatabase } from "@/storage/db.js";
import { findPortfolioById } from "@/storage/repositories/portfolioRepository.js";
import { portfolios, positions } from "@/storage/schema.js";

export type SyncChainHoldingsInput = {
	portfolioId: number;
	walletAddress: string;
	chainId: SupportedDepositChainId;
	rpcUrl: string;
	assets: readonly Cryptocurrency[];
};

export async function syncPortfolioHoldingsFromChain(
	db: AppDatabase,
	input: SyncChainHoldingsInput,
	fetchImpl: typeof fetch = fetch,
): Promise<void> {
	const portfolio = await findPortfolioById(db, input.portfolioId);
	if (!portfolio) {
		throw new Error(`Portfolio ${input.portfolioId} not found`);
	}

	const now = new Date();
	const onChainHoldings: Record<string, number> = {};

	for (const asset of input.assets) {
		const evm = asset.evm;
		if (!evm || evm.chainId !== input.chainId) {
			continue;
		}

		const balance = await fetchErc20Balance(
			{
				rpcUrl: input.rpcUrl,
				contractAddress: evm.contractAddress,
				walletAddress: input.walletAddress,
				decimals: evm.decimals,
			},
			fetchImpl,
		);

		if (balance > 0) {
			onChainHoldings[asset.symbol] = balance;
		}
	}

	const existing = await db
		.select()
		.from(positions)
		.where(eq(positions.portfolioId, input.portfolioId));

	for (const row of existing) {
		const nextQuantity = onChainHoldings[row.symbol] ?? 0;
		if (nextQuantity <= 0) {
			await db.delete(positions).where(eq(positions.id, row.id));
			continue;
		}

		if (Math.abs(nextQuantity - row.quantity) > 1e-12) {
			await db
				.update(positions)
				.set({ quantity: nextQuantity, updatedAt: now })
				.where(eq(positions.id, row.id));
		}
		delete onChainHoldings[row.symbol];
	}

	for (const [symbol, quantity] of Object.entries(onChainHoldings)) {
		await db.insert(positions).values({
			portfolioId: input.portfolioId,
			symbol,
			quantity,
			updatedAt: now,
		});
	}

	await db
		.update(portfolios)
		.set({ updatedAt: now })
		.where(eq(portfolios.id, input.portfolioId));
}

export function resolveSyncAssets(
	assets: readonly Cryptocurrency[],
	chainId: SupportedDepositChainId,
): Cryptocurrency[] {
	return assets.filter(
		(asset) => asset.evm !== undefined && asset.evm.chainId === chainId,
	);
}
