/** Base Sepolia testnet — for deposit/withdrawal testing. */
export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const SEPOLIA_USDC = {
	chainId: BASE_SEPOLIA_CHAIN_ID,
	contractAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
	decimals: 6,
} as const;

/** OP Stack predeploy — same address as Base mainnet WETH. */
export const SEPOLIA_WETH = {
	chainId: BASE_SEPOLIA_CHAIN_ID,
	contractAddress: "0x4200000000000000000000000000000000000006",
	decimals: 18,
} as const;
