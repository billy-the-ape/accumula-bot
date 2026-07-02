/** Base mainnet — canonical chain for v1 live trading. */
export const BASE_CHAIN_ID = 8453;

export const BASE_USDC = {
	chainId: BASE_CHAIN_ID,
	contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
	decimals: 6,
} as const;

export const BASE_EURC = {
	chainId: BASE_CHAIN_ID,
	contractAddress: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
	decimals: 6,
} as const;

/** Coinbase Wrapped BTC — on-chain token for logical symbol BTC. */
export const BASE_CBTC = {
	chainId: BASE_CHAIN_ID,
	contractAddress: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
	decimals: 8,
} as const;

/** Wrapped ETH — on-chain token for logical symbol ETH. */
export const BASE_WETH = {
	chainId: BASE_CHAIN_ID,
	contractAddress: "0x4200000000000000000000000000000000000006",
	decimals: 18,
} as const;

/** Bridged SOL via Base↔Solana bridge (9 decimals, matching native SOL). */
export const BASE_SOL = {
	chainId: BASE_CHAIN_ID,
	contractAddress: "0x311935Cd80B76769bF2ecC9D8Ab7635b2139cf82",
	decimals: 9,
} as const;

export const BASE_CBETH = {
	chainId: BASE_CHAIN_ID,
	contractAddress: "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22",
	decimals: 18,
} as const;

export const BASE_WSTETH = {
	chainId: BASE_CHAIN_ID,
	contractAddress: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
	decimals: 18,
} as const;

export const BASE_RETH = {
	chainId: BASE_CHAIN_ID,
	contractAddress: "0xB6fe221Fe9EeF5aBa221c348bA20A1Bf5e73624c",
	decimals: 18,
} as const;

export const BASE_LINK = {
	chainId: BASE_CHAIN_ID,
	contractAddress: "0x88Fb150BDc53A65fe94Dea0C9BA0a6dAf8C6e196",
	decimals: 18,
} as const;
