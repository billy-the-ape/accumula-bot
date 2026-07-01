import { encodeFunctionData } from "viem";
import type { SupportedDepositChainId } from "@/config/chainAssets.js";
import { getChainEvmMetadata } from "@/config/chainAssets.js";

export type ContractCall = {
	to: `0x${string}`;
	data: `0x${string}`;
	value?: bigint;
};

/** CDP VerifyingPaymaster — users approve this to pay gas in ERC-20. */
export const CDP_ERC20_PAYMASTER: Record<
	SupportedDepositChainId,
	`0x${string}`
> = {
	8453: "0x2FAEB0760D4230Ef2aC21496Bb4F0b47D634FD4c",
	84532: "0x709a4bae3db73a8e717aefca13e88512f738b27f",
};

export type CdpGasPaymentMode = "sponsor" | "usdc";

export function parseCdpGasPaymentMode(
	value: string | undefined,
): CdpGasPaymentMode {
	if (value === "sponsor") {
		return "sponsor";
	}
	return "usdc";
}

/** Minimum USDC allowance before we prepend an approval (covers many swaps). */
export const MIN_GAS_PAYMENT_ALLOWANCE_UNITS = 10_000_000n; // $10 at 6 decimals

const ERC20_ALLOWANCE_ABI = [
	{
		type: "function",
		name: "allowance",
		stateMutability: "view",
		inputs: [
			{ name: "owner", type: "address" },
			{ name: "spender", type: "address" },
		],
		outputs: [{ name: "", type: "uint256" }],
	},
] as const;

const ERC20_APPROVE_ABI = [
	{
		type: "function",
		name: "approve",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "spender", type: "address" },
			{ name: "amount", type: "uint256" },
		],
		outputs: [{ name: "", type: "bool" }],
	},
] as const;

export function getCdpErc20PaymasterAddress(
	chainId: SupportedDepositChainId,
): `0x${string}` {
	return CDP_ERC20_PAYMASTER[chainId];
}

export function resolveGasPaymentUsdcToken(
	chainId: SupportedDepositChainId,
	cashSymbol: string,
	mode: CdpGasPaymentMode,
): `0x${string}` | undefined {
	if (mode !== "usdc") {
		return undefined;
	}
	if (cashSymbol !== "USDC") {
		throw new Error("CDP USDC gas payment requires portfolio cash symbol USDC");
	}
	const usdc = getChainEvmMetadata("USDC", chainId);
	if (!usdc) {
		throw new Error(`USDC is not configured for chain ${chainId}`);
	}
	return usdc.contractAddress as `0x${string}`;
}

export function buildPaymasterUsdcApprovalCall(params: {
	usdcToken: `0x${string}`;
	chainId: SupportedDepositChainId;
	approvalAmount?: bigint;
}): ContractCall {
	const paymaster = getCdpErc20PaymasterAddress(params.chainId);
	const amount = params.approvalAmount ?? 2n ** 256n - 1n;

	return {
		to: params.usdcToken,
		data: encodeFunctionData({
			abi: ERC20_APPROVE_ABI,
			functionName: "approve",
			args: [paymaster, amount],
		}),
	};
}

export function prependPaymasterApprovalIfNeeded(params: {
	calls: readonly ContractCall[];
	allowance: bigint;
	usdcToken: `0x${string}`;
	chainId: SupportedDepositChainId;
	minAllowance?: bigint;
}): ContractCall[] {
	const minAllowance = params.minAllowance ?? MIN_GAS_PAYMENT_ALLOWANCE_UNITS;
	if (params.allowance >= minAllowance) {
		return [...params.calls];
	}

	return [
		buildPaymasterUsdcApprovalCall({
			usdcToken: params.usdcToken,
			chainId: params.chainId,
		}),
		...params.calls,
	];
}

export async function readErc20Allowance(params: {
	rpcUrl: string;
	token: `0x${string}`;
	owner: `0x${string}`;
	spender: `0x${string}`;
	chainId: SupportedDepositChainId;
}): Promise<bigint> {
	const { createPublicClient, http } = await import("viem");
	const { resolveViemChain } = await import("@/live/dex/liveWallet.js");
	const chain = resolveViemChain(params.chainId);
	const client = createPublicClient({
		chain,
		transport: http(params.rpcUrl),
	});

	return client.readContract({
		address: params.token,
		abi: ERC20_ALLOWANCE_ABI,
		functionName: "allowance",
		args: [params.owner, params.spender],
	});
}
