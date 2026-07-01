import {
	BASE_CBETH,
	BASE_CBTC,
	BASE_CHAIN_ID,
	BASE_EURC,
	BASE_LINK,
	BASE_RETH,
	BASE_SOL,
	BASE_USDC,
	BASE_WETH,
	BASE_WSTETH,
} from "@/config/baseChain.js";
import {
	formatSupportedDepositChainIds,
	isSupportedDepositChainId,
	type SupportedDepositChainId,
} from "@/config/depositChains.js";
import {
	BASE_SEPOLIA_CHAIN_ID,
	SEPOLIA_USDC,
	SEPOLIA_WETH,
} from "@/config/sepoliaChain.js";
import type { EvmChainMetadata } from "@/schemas/AssetTaxonomy.js";

export type ChainEvmSymbol =
	| "BTC"
	| "ETH"
	| "SOL"
	| "USDC"
	| "EURC"
	| "cbETH"
	| "wstETH"
	| "rETH"
	| "LINK";

const CHAIN_EVM_TOKENS: Record<
	SupportedDepositChainId,
	Partial<Record<ChainEvmSymbol, EvmChainMetadata>>
> = {
	[BASE_CHAIN_ID]: {
		BTC: BASE_CBTC,
		ETH: BASE_WETH,
		SOL: BASE_SOL,
		USDC: BASE_USDC,
		EURC: BASE_EURC,
		cbETH: BASE_CBETH,
		wstETH: BASE_WSTETH,
		rETH: BASE_RETH,
		LINK: BASE_LINK,
	},
	[BASE_SEPOLIA_CHAIN_ID]: {
		ETH: SEPOLIA_WETH,
		USDC: SEPOLIA_USDC,
	},
};

export function assertSupportedDepositChainId(
	chainId: number,
): SupportedDepositChainId {
	if (!isSupportedDepositChainId(chainId)) {
		throw new Error(
			`DEPOSIT_CHAIN_ID must be ${formatSupportedDepositChainIds()} (Base mainnet or Base Sepolia), got ${chainId}`,
		);
	}
	return chainId;
}

export function getChainEvmMetadata(
	symbol: ChainEvmSymbol,
	chainId: SupportedDepositChainId,
): EvmChainMetadata | undefined {
	return CHAIN_EVM_TOKENS[chainId][symbol];
}

export function listChainEvmSymbols(
	chainId: SupportedDepositChainId,
): ChainEvmSymbol[] {
	return Object.keys(CHAIN_EVM_TOKENS[chainId]) as ChainEvmSymbol[];
}

export {
	formatSupportedDepositChainIds,
	isSupportedDepositChainId,
	SUPPORTED_DEPOSIT_CHAIN_IDS,
	type SupportedDepositChainId,
} from "@/config/depositChains.js";
