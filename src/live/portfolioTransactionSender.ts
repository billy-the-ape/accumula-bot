import { createPublicClient, encodeFunctionData, http } from "viem";
import {
	createBundlerClient,
	toCoinbaseSmartAccount,
} from "viem/account-abstraction";
import { privateKeyToAccount } from "viem/accounts";
import type { SupportedDepositChainId } from "@/config/chainAssets.js";
import type { CdpGasPaymentMode } from "@/live/cdpPaymaster.js";
import {
	getCdpErc20PaymasterAddress,
	humanizePaymasterError,
	prependPaymasterApprovalIfNeeded,
	readErc20Allowance,
	resolveGasPaymentUsdcToken,
} from "@/live/cdpPaymaster.js";
import {
	createPortfolioWalletClients,
	resolveViemChain,
	sendRawContractTransaction,
} from "@/live/dex/liveWallet.js";
import type { PortfolioWalletKind } from "@/live/portfolioWalletKind.js";

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

export type PortfolioContractCall = {
	to: `0x${string}`;
	data: `0x${string}`;
	value?: bigint;
};

export type PortfolioTransactionContext = {
	walletKind: PortfolioWalletKind;
	walletAddress: `0x${string}`;
	ownerPrivateKey: `0x${string}`;
	chainId: SupportedDepositChainId;
	depositRpcUrl: string;
	cdpPaymasterRpcUrl?: string;
	cdpGasPaymentMode?: CdpGasPaymentMode;
	gasPaymentUsdc?: `0x${string}`;
};

export class PortfolioTransactionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PortfolioTransactionError";
	}
}

function encodeApproveCall(
	token: `0x${string}`,
	spender: `0x${string}`,
	amount: bigint,
): PortfolioContractCall {
	return {
		to: token,
		data: encodeFunctionData({
			abi: ERC20_APPROVE_ABI,
			functionName: "approve",
			args: [spender, amount],
		}),
	};
}

export function buildPortfolioTransactionContext(params: {
	walletKind: PortfolioWalletKind;
	walletAddress: `0x${string}`;
	ownerPrivateKey: `0x${string}`;
	chainId: SupportedDepositChainId;
	depositRpcUrl: string;
	cashSymbol: string;
	cdpPaymasterRpcUrl?: string;
	cdpGasPaymentMode?: CdpGasPaymentMode;
}): PortfolioTransactionContext {
	const cdpGasPaymentMode = params.cdpGasPaymentMode ?? "sponsor";
	const gasPaymentUsdc =
		params.walletKind === "smart_account"
			? resolveGasPaymentUsdcToken(
					params.chainId,
					params.cashSymbol,
					cdpGasPaymentMode,
				)
			: undefined;

	return {
		walletKind: params.walletKind,
		walletAddress: params.walletAddress,
		ownerPrivateKey: params.ownerPrivateKey,
		chainId: params.chainId,
		depositRpcUrl: params.depositRpcUrl,
		cdpGasPaymentMode,
		...(params.cdpPaymasterRpcUrl
			? { cdpPaymasterRpcUrl: params.cdpPaymasterRpcUrl }
			: {}),
		...(gasPaymentUsdc ? { gasPaymentUsdc } : {}),
	};
}

export async function sendPortfolioContractCalls(
	context: PortfolioTransactionContext,
	calls: readonly PortfolioContractCall[],
): Promise<`0x${string}`> {
	if (calls.length === 0) {
		throw new PortfolioTransactionError("No contract calls to send");
	}

	if (context.walletKind === "smart_account") {
		return sendSmartAccountCalls(context, calls);
	}

	const clients = createPortfolioWalletClients({
		privateKey: context.ownerPrivateKey,
		chainId: context.chainId,
		rpcUrl: context.depositRpcUrl,
	});

	let lastHash: `0x${string}` = "0x0";
	for (const call of calls) {
		lastHash = await sendRawContractTransaction(clients, call);
	}
	return lastHash;
}

async function sendSmartAccountCalls(
	context: PortfolioTransactionContext,
	calls: readonly PortfolioContractCall[],
): Promise<`0x${string}`> {
	try {
		return await sendSmartAccountCallsInner(context, calls);
	} catch (error) {
		const gasPaymentMode = context.cdpGasPaymentMode ?? "sponsor";
		console.error(
			`Smart account transaction failed (CDP_GAS_PAYMENT_MODE=${gasPaymentMode}):`,
			error instanceof Error ? error.message : error,
		);
		throw new PortfolioTransactionError(
			humanizePaymasterError(error, gasPaymentMode),
		);
	}
}

async function sendSmartAccountCallsInner(
	context: PortfolioTransactionContext,
	calls: readonly PortfolioContractCall[],
): Promise<`0x${string}`> {
	const paymasterRpcUrl = context.cdpPaymasterRpcUrl;
	if (!paymasterRpcUrl) {
		throw new PortfolioTransactionError(
			"CDP_PAYMASTER_RPC_URL is required for smart account transactions",
		);
	}

	const chain = resolveViemChain(context.chainId);
	const publicClient = createPublicClient({
		chain,
		transport: http(paymasterRpcUrl),
	});
	const owner = privateKeyToAccount(context.ownerPrivateKey);
	const account = await toCoinbaseSmartAccount({
		client: publicClient,
		owners: [owner],
		version: "1.1",
	});

	if (account.address.toLowerCase() !== context.walletAddress.toLowerCase()) {
		throw new PortfolioTransactionError(
			"Smart account address does not match stored portfolio wallet",
		);
	}

	const bundlerClient = createBundlerClient({
		account,
		client: publicClient,
		chain,
		transport: http(paymasterRpcUrl),
	});

	let preparedCalls: PortfolioContractCall[] = [...calls];
	const gasPaymentUsdc = context.gasPaymentUsdc;
	const gasPaymentMode = context.cdpGasPaymentMode ?? "sponsor";

	if (gasPaymentUsdc && gasPaymentMode === "usdc") {
		const paymasterAddress = getCdpErc20PaymasterAddress(context.chainId);
		const allowance = await readErc20Allowance({
			rpcUrl: context.depositRpcUrl,
			token: gasPaymentUsdc,
			owner: context.walletAddress,
			spender: paymasterAddress,
			chainId: context.chainId,
		});
		preparedCalls = prependPaymasterApprovalIfNeeded({
			calls: preparedCalls,
			allowance,
			usdcToken: gasPaymentUsdc,
			chainId: context.chainId,
		});
	}

	account.userOperation = {
		estimateGas: async (userOperation) => {
			const estimate = await bundlerClient.estimateUserOperationGas(
				userOperation as Parameters<
					typeof bundlerClient.estimateUserOperationGas
				>[0],
			);
			return {
				...estimate,
				preVerificationGas: estimate.preVerificationGas * 2n,
			};
		},
	};

	const userOpHash = await bundlerClient.sendUserOperation({
		account,
		calls: preparedCalls.map((call) => ({
			to: call.to,
			data: call.data,
			value: call.value ?? 0n,
		})),
		paymaster: true,
		...(gasPaymentUsdc && gasPaymentMode === "usdc"
			? { paymasterContext: { erc20: gasPaymentUsdc } }
			: {}),
	});

	const receipt = await bundlerClient.waitForUserOperationReceipt({
		hash: userOpHash,
	});

	return receipt.receipt.transactionHash;
}

export function buildApproveCallIfNeeded(params: {
	token: `0x${string}`;
	spender: `0x${string}`;
	amount: bigint;
	required: boolean;
}): PortfolioContractCall | undefined {
	if (!params.required) {
		return undefined;
	}
	return encodeApproveCall(params.token, params.spender, params.amount);
}
