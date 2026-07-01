import { encodeFunctionData } from "viem";
import {
	toTokenUnits,
	truncateToTokenDecimals,
} from "@/live/dex/tokenAmounts.js";
import type { PortfolioContractCall } from "@/live/portfolioTransactionSender.js";

const ERC20_TRANSFER_ABI = [
	{
		type: "function",
		name: "transfer",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "to", type: "address" },
			{ name: "amount", type: "uint256" },
		],
		outputs: [{ name: "", type: "bool" }],
	},
] as const;

export function buildErc20TransferCall(params: {
	token: `0x${string}`;
	to: `0x${string}`;
	amount: number;
	decimals: number;
}): PortfolioContractCall {
	const amountUnits = toTokenUnits(
		truncateToTokenDecimals(params.amount, params.decimals),
		params.decimals,
	);
	if (amountUnits <= 0n) {
		throw new Error("Transfer amount must be positive");
	}

	return {
		to: params.token,
		data: encodeFunctionData({
			abi: ERC20_TRANSFER_ABI,
			functionName: "transfer",
			args: [params.to, amountUnits],
		}),
	};
}
