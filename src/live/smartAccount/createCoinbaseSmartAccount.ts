import { createPublicClient, http } from "viem";
import { toCoinbaseSmartAccount } from "viem/account-abstraction";
import { privateKeyToAccount } from "viem/accounts";
import type { SupportedDepositChainId } from "@/config/chainAssets.js";
import { resolveViemChain } from "@/live/dex/liveWallet.js";

export async function createCoinbaseSmartAccountAddress(params: {
	ownerPrivateKey: `0x${string}`;
	chainId: SupportedDepositChainId;
	rpcUrl: string;
}): Promise<`0x${string}`> {
	const chain = resolveViemChain(params.chainId);
	const publicClient = createPublicClient({
		chain,
		transport: http(params.rpcUrl),
	});
	const owner = privateKeyToAccount(params.ownerPrivateKey);
	const account = await toCoinbaseSmartAccount({
		client: publicClient,
		owners: [owner],
		version: "1.1",
	});

	return account.address;
}
