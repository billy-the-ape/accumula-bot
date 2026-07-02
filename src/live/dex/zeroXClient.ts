const ZEROX_API_BASE = "https://api.0x.org";

export type ZeroXQuoteRequest = {
	chainId: number;
	sellToken: `0x${string}`;
	buyToken: `0x${string}`;
	sellAmount: bigint;
	taker: `0x${string}`;
	slippageBps: number;
};

export type ZeroXQuote = {
	buyAmount: bigint;
	minBuyAmount: bigint;
	sellAmount: bigint;
	transaction: {
		to: `0x${string}`;
		data: `0x${string}`;
		value: bigint;
		gas?: bigint;
	};
	allowanceSpender?: `0x${string}`;
	allowanceRequired: boolean;
};

export class ZeroXApiError extends Error {
	constructor(
		message: string,
		readonly statusCode?: number,
	) {
		super(message);
		this.name = "ZeroXApiError";
	}
}

function parseBigInt(value: string | undefined): bigint {
	if (!value) {
		return 0n;
	}
	return BigInt(value);
}

function parseZeroXQuote(payload: Record<string, unknown>): ZeroXQuote {
	const transaction = payload.transaction as
		| Record<string, unknown>
		| undefined;
	if (!transaction?.to || !transaction.data) {
		throw new ZeroXApiError("0x quote missing transaction calldata");
	}

	const issues = payload.issues as Record<string, unknown> | undefined;
	const allowance = issues?.allowance as Record<string, unknown> | undefined;
	const allowanceSpender = allowance?.spender as `0x${string}` | undefined;
	const allowanceActual = parseBigInt(allowance?.actual as string | undefined);
	const sellAmount = parseBigInt(payload.sellAmount as string | undefined);

	return {
		buyAmount: parseBigInt(payload.buyAmount as string | undefined),
		minBuyAmount: parseBigInt(payload.minBuyAmount as string | undefined),
		sellAmount,
		transaction: {
			to: transaction.to as `0x${string}`,
			data: transaction.data as `0x${string}`,
			value: parseBigInt(transaction.value as string | undefined),
			...(transaction.gas
				? { gas: parseBigInt(transaction.gas as string) }
				: {}),
		},
		...(allowanceSpender ? { allowanceSpender } : {}),
		allowanceRequired:
			allowanceSpender !== undefined && allowanceActual < sellAmount,
	};
}

export async function fetchZeroXQuote(
	request: ZeroXQuoteRequest,
	apiKey: string,
	fetchImpl: typeof fetch = fetch,
): Promise<ZeroXQuote> {
	const params = new URLSearchParams({
		chainId: String(request.chainId),
		sellToken: request.sellToken,
		buyToken: request.buyToken,
		sellAmount: request.sellAmount.toString(),
		taker: request.taker,
		slippageBps: String(request.slippageBps),
	});

	const response = await fetchImpl(
		`${ZEROX_API_BASE}/swap/allowance-holder/quote?${params.toString()}`,
		{
			headers: {
				"0x-api-key": apiKey,
				"0x-version": "v2",
			},
		},
	);

	const payload = (await response.json()) as Record<string, unknown>;

	if (!response.ok) {
		const message =
			typeof payload.message === "string"
				? payload.message
				: typeof payload.reason === "string"
					? payload.reason
					: `0x quote failed with HTTP ${response.status}`;
		throw new ZeroXApiError(message, response.status);
	}

	return parseZeroXQuote(payload);
}

export function passesSlippageCheck(params: {
	expectedBuyAmount: bigint;
	minBuyAmount: bigint;
}): boolean {
	return params.minBuyAmount >= params.expectedBuyAmount;
}

export function passesQuotedBuySlippageCheck(params: {
	expectedBuyAmount: bigint;
	quotedBuyAmount: bigint;
	maxSlippageBps: number;
}): boolean {
	const minExpected =
		(params.expectedBuyAmount * BigInt(10_000 - params.maxSlippageBps)) /
		10_000n;
	return params.quotedBuyAmount >= minExpected;
}
