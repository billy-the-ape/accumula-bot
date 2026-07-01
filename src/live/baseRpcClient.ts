const BALANCE_OF_SELECTOR = "0x70a08231";

export type FetchErc20BalanceParams = {
	rpcUrl: string;
	contractAddress: string;
	walletAddress: string;
	decimals: number;
};

function encodeBalanceOfCall(walletAddress: string): string {
	const address = walletAddress.startsWith("0x")
		? walletAddress.slice(2)
		: walletAddress;
	return `${BALANCE_OF_SELECTOR}${address.toLowerCase().padStart(64, "0")}`;
}

function parseHexBalance(result: string): bigint {
	if (!result || result === "0x") {
		return 0n;
	}
	return BigInt(result);
}

/** Reads ERC-20 balance via `eth_call` and returns human-readable token units. */
export async function fetchErc20Balance(
	params: FetchErc20BalanceParams,
	fetchImpl: typeof fetch = fetch,
): Promise<number> {
	const response = await fetchImpl(params.rpcUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "eth_call",
			params: [
				{
					to: params.contractAddress,
					data: encodeBalanceOfCall(params.walletAddress),
				},
				"latest",
			],
		}),
	});

	if (!response.ok) {
		throw new Error(`Base RPC HTTP ${response.status}`);
	}

	const payload = (await response.json()) as {
		result?: string;
		error?: { message?: string };
	};

	if (payload.error) {
		throw new Error(payload.error.message ?? "Base RPC eth_call failed");
	}

	const raw = parseHexBalance(payload.result ?? "0x");
	return Number(raw) / 10 ** params.decimals;
}
