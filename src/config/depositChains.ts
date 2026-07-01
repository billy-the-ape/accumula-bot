import { BASE_CHAIN_ID } from "@/config/baseChain.js";
import { BASE_SEPOLIA_CHAIN_ID } from "@/config/sepoliaChain.js";

export const SUPPORTED_DEPOSIT_CHAIN_IDS = [
	BASE_CHAIN_ID,
	BASE_SEPOLIA_CHAIN_ID,
] as const;

export type SupportedDepositChainId =
	(typeof SUPPORTED_DEPOSIT_CHAIN_IDS)[number];

export function isSupportedDepositChainId(
	chainId: number,
): chainId is SupportedDepositChainId {
	return (SUPPORTED_DEPOSIT_CHAIN_IDS as readonly number[]).includes(chainId);
}

export function formatSupportedDepositChainIds(): string {
	return SUPPORTED_DEPOSIT_CHAIN_IDS.join(" or ");
}
