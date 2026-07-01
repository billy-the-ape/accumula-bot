import { BASE_CHAIN_ID } from "@/config/baseChain.js";
import {
	type ChainEvmSymbol,
	getChainEvmMetadata,
	type SupportedDepositChainId,
} from "@/config/chainAssets.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";

export const CRYPTOCURRENCY_REGISTRY = {
	BTC: {
		name: "Bitcoin",
		symbol: "BTC",
		coingeckoId: "bitcoin",
		exchangeId: "BTC",
		macroRiskCategory: "neutral",
		assetClass: "crypto_major",
	},
	ETH: {
		name: "Ethereum",
		symbol: "ETH",
		coingeckoId: "ethereum",
		exchangeId: "ETH",
		macroRiskCategory: "risk_on",
		assetClass: "crypto_major",
	},
	SOL: {
		name: "Solana",
		symbol: "SOL",
		coingeckoId: "solana",
		exchangeId: "SOL",
		macroRiskCategory: "risk_on",
		assetClass: "crypto_alt",
	},
	USDC: {
		name: "USD Coin",
		symbol: "USDC",
		coingeckoId: "usd-coin",
		exchangeId: "USDC",
		macroRiskCategory: "risk_off",
		assetClass: "stablecoin",
		isStable: true,
	},
	EURC: {
		name: "Euro Coin",
		symbol: "EURC",
		coingeckoId: "euro-coin",
		exchangeId: "EURC",
		macroRiskCategory: "risk_off",
		assetClass: "stablecoin",
		isStable: true,
	},
	cbETH: {
		name: "Coinbase Wrapped Staked ETH",
		symbol: "cbETH",
		coingeckoId: "coinbase-wrapped-staked-eth",
		exchangeId: "cbETH",
		macroRiskCategory: "neutral",
		assetClass: "yield_bearing",
	},
	wstETH: {
		name: "Wrapped stETH",
		symbol: "wstETH",
		coingeckoId: "wrapped-steth",
		exchangeId: "wstETH",
		macroRiskCategory: "neutral",
		assetClass: "yield_bearing",
	},
	rETH: {
		name: "Rocket Pool ETH",
		symbol: "rETH",
		coingeckoId: "rocket-pool-eth",
		exchangeId: "rETH",
		macroRiskCategory: "neutral",
		assetClass: "yield_bearing",
	},
	LINK: {
		name: "Chainlink",
		symbol: "LINK",
		coingeckoId: "chainlink",
		exchangeId: "LINK",
		macroRiskCategory: "neutral",
		assetClass: "crypto_major",
	},
} as const satisfies Record<string, Omit<Cryptocurrency, "evm">>;

export type CryptocurrencySymbol = keyof typeof CRYPTOCURRENCY_REGISTRY;

export function isKnownCryptocurrencySymbol(
	symbol: string,
): symbol is CryptocurrencySymbol {
	return symbol in CRYPTOCURRENCY_REGISTRY;
}

/** Resolves env/config symbols to registry keys (case-insensitive). */
export function normalizeRegistrySymbol(
	raw: string,
): CryptocurrencySymbol | null {
	const trimmed = raw.trim();
	if (isKnownCryptocurrencySymbol(trimmed)) {
		return trimmed;
	}
	const upper = trimmed.toUpperCase();
	for (const key of Object.keys(
		CRYPTOCURRENCY_REGISTRY,
	) as CryptocurrencySymbol[]) {
		if (key.toUpperCase() === upper) {
			return key;
		}
	}
	return null;
}

export function resolveCryptocurrencyForChain(
	symbol: CryptocurrencySymbol,
	chainId: SupportedDepositChainId,
): Cryptocurrency {
	const base = CRYPTOCURRENCY_REGISTRY[symbol];
	const evm = getChainEvmMetadata(symbol as ChainEvmSymbol, chainId);
	return {
		...base,
		...(evm ? { evm } : {}),
	};
}

/** Defaults to Base mainnet EVM metadata for callers without chain context. */
export function getCryptocurrency(
	symbol: CryptocurrencySymbol,
	chainId: SupportedDepositChainId = BASE_CHAIN_ID,
): Cryptocurrency {
	return resolveCryptocurrencyForChain(symbol, chainId);
}

export function listRegistryAssets(
	chainId: SupportedDepositChainId = BASE_CHAIN_ID,
): Cryptocurrency[] {
	return (Object.keys(CRYPTOCURRENCY_REGISTRY) as CryptocurrencySymbol[]).map(
		(symbol) => resolveCryptocurrencyForChain(symbol, chainId),
	);
}
