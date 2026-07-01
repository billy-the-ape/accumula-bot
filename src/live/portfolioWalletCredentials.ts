import { eq } from "drizzle-orm";
import type { PortfolioWalletKind } from "@/live/portfolioWalletKind.js";
import { parsePortfolioWalletKind } from "@/live/portfolioWalletKind.js";
import type { AppDatabase } from "@/storage/db.js";
import { portfolios } from "@/storage/schema.js";

export type PortfolioWalletCredentials = {
	walletAddress: `0x${string}`;
	walletKind: PortfolioWalletKind;
	encryptedPrivateKey: string;
	chainId: number;
};

export async function findPortfolioWalletCredentials(
	db: AppDatabase,
	portfolioId: number,
): Promise<PortfolioWalletCredentials | undefined> {
	const row = await db
		.select({
			walletAddress: portfolios.walletAddress,
			walletKind: portfolios.walletKind,
			encryptedPrivateKey: portfolios.encryptedPrivateKey,
			chainId: portfolios.chainId,
		})
		.from(portfolios)
		.where(eq(portfolios.id, portfolioId))
		.get();

	if (
		!row?.walletAddress ||
		!row.encryptedPrivateKey ||
		row.chainId === null ||
		row.chainId === undefined
	) {
		return undefined;
	}

	return {
		walletAddress: row.walletAddress as `0x${string}`,
		walletKind: parsePortfolioWalletKind(row.walletKind),
		encryptedPrivateKey: row.encryptedPrivateKey,
		chainId: row.chainId,
	};
}

export function isLiveExecutionConfigured(config: {
	live: { zeroXApiKey?: string; walletEncryptionKey?: string };
}): boolean {
	return Boolean(config.live.zeroXApiKey && config.live.walletEncryptionKey);
}

export function isSmartAccountLiveEnabled(config: {
	live: { cdpPaymasterRpcUrl?: string; walletEncryptionKey?: string };
}): boolean {
	return Boolean(
		config.live.cdpPaymasterRpcUrl && config.live.walletEncryptionKey,
	);
}
