import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import {
	executeLiveSwap,
	LIVE_SWAP_QUOTE_ATTEMPTS,
	LIVE_SWAP_QUOTE_RETRY_DELAY_MS,
	LiveSwapError,
} from "@/live/dex/executeLiveSwap.js";

vi.mock("@/live/portfolioTransactionSender.js", () => ({
	buildPortfolioTransactionContext: vi.fn(() => ({})),
	sendPortfolioContractCalls: vi.fn(async () => "0xabc123" as `0x${string}`),
	buildApproveCallIfNeeded: vi.fn(() => undefined),
}));

vi.mock("@/live/dex/liveWallet.js", () => ({
	fetchNativeEthBalance: vi.fn(async () => 999_999_999_999_999n),
	MIN_NATIVE_ETH_FOR_SWAP: 1n,
}));

const testConfig = loadTestConfig({
	ASSET_TRADEABLE: "BTC,ETH,SOL,USDC,LINK",
});

const baseInput = {
	fill: {
		side: "buy" as const,
		symbol: "LINK",
		quantity: 10,
		priceUsd: 15,
	},
	cashSymbol: "USDC",
	chainId: 8453 as const,
	walletAddress: "0x1111111111111111111111111111111111111111" as `0x${string}`,
	walletKind: "eoa" as const,
	privateKey:
		"0x2222222222222222222222222222222222222222222222222222222222222222" as `0x${string}`,
	rpcUrl: "https://mainnet.base.org",
	zeroXApiKey: "test-key",
	maxSlippageBps: 100,
	gasBootstrapUsd: 3,
	cdpGasPaymentMode: "sponsor" as const,
	assets: testConfig.assetTradeable,
};

function buildQuoteResponse(buyAmount: string) {
	return new Response(
		JSON.stringify({
			buyAmount,
			minBuyAmount: buyAmount,
			sellAmount: "150000000",
			transaction: {
				to: "0x0000000000001ff3684f28c67538d4d072c22734",
				data: "0x1234",
				value: "0",
			},
			issues: {
				allowance: {
					actual: "999999999999",
					spender: "0x0000000000001ff3684f28c67538d4d072c22734",
				},
			},
		}),
		{ status: 200 },
	);
}

describe("executeLiveSwap", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it("retries quotes and succeeds on a later attempt", async () => {
		const fetchImpl = vi
			.fn()
			.mockImplementationOnce(async () =>
				buildQuoteResponse("9800000000000000000"),
			)
			.mockImplementationOnce(async () =>
				buildQuoteResponse("9800000000000000000"),
			)
			.mockImplementationOnce(async () =>
				buildQuoteResponse("10000000000000000000"),
			);

		const resultPromise = executeLiveSwap(
			{
				...baseInput,
			},
			fetchImpl,
		);

		await vi.runAllTimersAsync();
		const result = await resultPromise;

		expect(fetchImpl).toHaveBeenCalledTimes(LIVE_SWAP_QUOTE_ATTEMPTS);
		expect(result.txHash).toBe("0xabc123");
		expect(result.buySymbol).toBe("LINK");
	});

	it("throws after exhausting quote retries", async () => {
		const fetchImpl = vi.fn(async () =>
			buildQuoteResponse("9800000000000000000"),
		);

		const resultPromise = executeLiveSwap(
			{
				...baseInput,
			},
			fetchImpl,
		).catch((error: unknown) => error);

		await vi.runAllTimersAsync();
		const error = await resultPromise;

		expect(error).toBeInstanceOf(LiveSwapError);
		expect((error as LiveSwapError).message).toContain("after 3 attempts");
		expect(fetchImpl).toHaveBeenCalledTimes(LIVE_SWAP_QUOTE_ATTEMPTS);
		expect(LIVE_SWAP_QUOTE_RETRY_DELAY_MS).toBe(3_000);
	});
});
