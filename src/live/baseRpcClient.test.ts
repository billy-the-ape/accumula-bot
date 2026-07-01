import { describe, expect, it, vi } from "vitest";
import { fetchErc20Balance } from "@/live/baseRpcClient.js";

describe("fetchErc20Balance", () => {
	it("parses eth_call balance response", async () => {
		const fetchImpl = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				result:
					"0x0000000000000000000000000000000000000000000000000000000005f5e100",
			}),
		})) as unknown as typeof fetch;

		const balance = await fetchErc20Balance(
			{
				rpcUrl: "https://mainnet.base.org",
				contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
				walletAddress: "0x0000000000000000000000000000000000000001",
				decimals: 6,
			},
			fetchImpl,
		);

		expect(balance).toBe(100);
		expect(fetchImpl).toHaveBeenCalledOnce();
		const body = JSON.parse(
			(fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
				?.body as string,
		) as { method: string };
		expect(body.method).toBe("eth_call");
	});

	it("returns zero for empty balance", async () => {
		const fetchImpl = vi.fn(async () => ({
			ok: true,
			json: async () => ({ result: "0x" }),
		})) as unknown as typeof fetch;

		const balance = await fetchErc20Balance(
			{
				rpcUrl: "https://mainnet.base.org",
				contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
				walletAddress: "0x0000000000000000000000000000000000000001",
				decimals: 6,
			},
			fetchImpl,
		);

		expect(balance).toBe(0);
	});
});
