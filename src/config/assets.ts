import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";

export const CRYPTOCURRENCY_REGISTRY = {
	BTC: {
		name: "Bitcoin",
		symbol: "BTC",
		coingeckoId: "bitcoin",
		exchangeId: "BTC",
	},
	ETH: {
		name: "Ethereum",
		symbol: "ETH",
		coingeckoId: "ethereum",
		exchangeId: "ETH",
	},
	SOL: {
		name: "Solana",
		symbol: "SOL",
		coingeckoId: "solana",
		exchangeId: "SOL",
	},
	USDC: {
		name: "USD Coin",
		symbol: "USDC",
		coingeckoId: "usd-coin",
		exchangeId: "USDC",
		isStable: true,
	},
} as const satisfies Record<string, Cryptocurrency>;

export type CryptocurrencySymbol = keyof typeof CRYPTOCURRENCY_REGISTRY;

export function isKnownCryptocurrencySymbol(
	symbol: string,
): symbol is CryptocurrencySymbol {
	return symbol in CRYPTOCURRENCY_REGISTRY;
}

export function getCryptocurrency(
	symbol: CryptocurrencySymbol,
): Cryptocurrency {
	return CRYPTOCURRENCY_REGISTRY[symbol];
}
