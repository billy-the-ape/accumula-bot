import { describe, expect, it } from "vitest";
import {
	fetchZeroXQuote,
	passesSlippageCheck,
} from "@/live/dex/zeroXClient.js";

describe("zeroXClient", () => {
	it("passes slippage when min buy meets expectation", () => {
		expect(
			passesSlippageCheck({
				expectedBuyAmount: 1000n,
				minBuyAmount: 1000n,
			}),
		).toBe(true);
		expect(
			passesSlippageCheck({
				expectedBuyAmount: 1000n,
				minBuyAmount: 999n,
			}),
		).toBe(false);
	});

	it("parses a 0x quote response", async () => {
		const fetchImpl = async () =>
			new Response(
				JSON.stringify({
					buyAmount: "2000000",
					minBuyAmount: "1980000",
					sellAmount: "1000000",
					transaction: {
						to: "0x0000000000001ff3684f28c67538d4d072c22734",
						data: "0x1234",
						value: "0",
						gas: "150000",
					},
					issues: {
						allowance: {
							actual: "0",
							spender: "0x0000000000001ff3684f28c67538d4d072c22734",
						},
					},
				}),
				{ status: 200 },
			);

		const quote = await fetchZeroXQuote(
			{
				chainId: 8453,
				sellToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
				buyToken: "0x4200000000000000000000000000000000000006",
				sellAmount: 1_000_000n,
				taker: "0x1111111111111111111111111111111111111111",
				slippageBps: 100,
			},
			"test-key",
			fetchImpl,
		);

		expect(quote.buyAmount).toBe(2_000_000n);
		expect(quote.allowanceRequired).toBe(true);
		expect(quote.transaction.to).toBe(
			"0x0000000000001ff3684f28c67538d4d072c22734",
		);
	});
});
