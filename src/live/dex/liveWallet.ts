import {
	type Chain,
	createPublicClient,
	createWalletClient,
	encodeFunctionData,
	http,
	type PrivateKeyAccount,
	type PublicClient,
	type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import type { SupportedDepositChainId } from "@/config/chainAssets.js";

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

export type PortfolioWalletClients = {
	walletClient: WalletClient;
	publicClient: PublicClient;
	account: PrivateKeyAccount;
	chain: Chain;
};

export function resolveViemChain(chainId: SupportedDepositChainId): Chain {
	if (chainId === 8453) {
		return base;
	}
	return baseSepolia;
}

export function createPortfolioWalletClients(params: {
	privateKey: `0x${string}`;
	chainId: SupportedDepositChainId;
	rpcUrl: string;
}): PortfolioWalletClients {
	const chain = resolveViemChain(params.chainId);
	const account = privateKeyToAccount(params.privateKey);
	const transport = http(params.rpcUrl);

	const walletClient = createWalletClient({
		account,
		chain,
		transport,
	});
	const publicClient = createPublicClient({
		chain,
		transport,
	});

	return { walletClient, publicClient, account, chain };
}

export async function fetchNativeEthBalance(
	rpcUrl: string,
	walletAddress: string,
	fetchImpl: typeof fetch = fetch,
): Promise<number> {
	const response = await fetchImpl(rpcUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "eth_getBalance",
			params: [walletAddress, "latest"],
		}),
	});

	if (!response.ok) {
		throw new Error(`RPC HTTP ${response.status} for eth_getBalance`);
	}

	const payload = (await response.json()) as {
		result?: string;
		error?: { message?: string };
	};

	if (payload.error) {
		throw new Error(payload.error.message ?? "eth_getBalance failed");
	}

	return Number(BigInt(payload.result ?? "0x0")) / 1e18;
}

export async function sendRawContractTransaction(
	clients: PortfolioWalletClients,
	tx: {
		to: `0x${string}`;
		data: `0x${string}`;
		value?: bigint;
		gas?: bigint;
	},
): Promise<`0x${string}`> {
	const hash = await clients.walletClient.sendTransaction({
		account: clients.account,
		chain: clients.chain,
		to: tx.to,
		data: tx.data,
		value: tx.value ?? 0n,
		...(tx.gas !== undefined ? { gas: tx.gas } : {}),
	});

	await clients.publicClient.waitForTransactionReceipt({ hash });
	return hash;
}

export async function approveErc20IfNeeded(
	clients: PortfolioWalletClients,
	params: {
		token: `0x${string}`;
		spender: `0x${string}`;
		amount: bigint;
	},
): Promise<`0x${string}`> {
	const data = encodeFunctionData({
		abi: ERC20_APPROVE_ABI,
		functionName: "approve",
		args: [params.spender, params.amount],
	});

	return sendRawContractTransaction(clients, {
		to: params.token,
		data,
	});
}

/** Minimum native ETH to attempt swaps without bootstrapping gas first. */
export const MIN_NATIVE_ETH_FOR_SWAP = 0.000_05;
