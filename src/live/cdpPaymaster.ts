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
	if (value === "usdc") {
		return "usdc";
	}
	return "sponsor";
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

/** Context passed as the 4th arg to pm_getPaymasterStubData / pm_getPaymasterData. */
export type CdpPaymasterContext =
	| { policyId: string }
	| { erc20: `0x${string}` };

export function resolvePaymasterContext(params: {
	gasPaymentMode: CdpGasPaymentMode;
	gasPaymentUsdc?: `0x${string}`;
	gasPolicyId?: string;
}): CdpPaymasterContext {
	if (params.gasPaymentMode === "usdc") {
		if (!params.gasPaymentUsdc) {
			throw new Error(
				"USDC gas payment requires portfolio cash symbol USDC on this chain",
			);
		}
		return { erc20: params.gasPaymentUsdc };
	}

	if (!params.gasPolicyId) {
		throw new Error(
			"CDP_GAS_POLICY_ID is required when CDP_GAS_PAYMENT_MODE=sponsor",
		);
	}

	return { policyId: params.gasPolicyId };
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

/** Turn raw CDP / viem paymaster RPC errors into operator-actionable text. */
export function humanizePaymasterError(
	error: unknown,
	gasPaymentMode: CdpGasPaymentMode = "sponsor",
): string {
	const message = error instanceof Error ? error.message : String(error);
	const lower = message.toLowerCase();

	if (lower.includes("payment method not found")) {
		if (gasPaymentMode === "usdc") {
			return (
				"CDP paymaster does not accept USDC gas payments on this project. " +
				"Set CDP_GAS_PAYMENT_MODE=sponsor in .env (uses your Gas policy budget), " +
				"or enable ERC-20 gas payments for USDC in the CDP Paymaster portal."
			);
		}

		return (
			"CDP paymaster rejected the transaction (payment method not found). " +
			"Set CDP_GAS_POLICY_ID in .env to your Gas policy ID from Paymaster → Configuration " +
			"in the CDP portal, then restart the bot. Also confirm paymaster is enabled, contracts " +
			"are allowlisted (USDC, 0x router, treasury), and gas limits are high enough."
		);
	}

	if (
		lower.includes("target address not in allowed contracts") ||
		lower.includes("method not in allowed methods")
	) {
		return (
			"CDP paymaster contract allowlist blocked this transaction. " +
			"Add USDC, 0x swap router, and treasury addresses in Paymaster → Configuration."
		);
	}

	if (lower.includes("request denied") || lower.includes("denied_error")) {
		return (
			"CDP paymaster denied the transaction (gas policy or spend limit). " +
			"Check global/per-user limits and contract allowlist in the CDP portal."
		);
	}

	return message;
}
