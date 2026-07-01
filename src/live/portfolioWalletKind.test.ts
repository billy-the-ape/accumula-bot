import { describe, expect, it, vi } from "vitest";
import { buildErc20TransferCall } from "@/live/dex/transferErc20.js";
import {
	type PortfolioTransactionContext,
	sendPortfolioContractCalls,
} from "@/live/portfolioTransactionSender.js";
import { parsePortfolioWalletKind } from "@/live/portfolioWalletKind.js";

vi.mock("@/live/dex/liveWallet.js", () => ({
	createPortfolioWalletClients: vi.fn(() => ({
		walletClient: {},
		publicClient: {},
	})),
	resolveViemChain: vi.fn(() => ({ id: 8453 })),
	sendRawContractTransaction: vi
		.fn()
		.mockResolvedValue(
			"0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
		),
}));

describe("parsePortfolioWalletKind", () => {
	it("defaults unknown values to eoa", () => {
		expect(parsePortfolioWalletKind(null)).toBe("eoa");
		expect(parsePortfolioWalletKind("invalid")).toBe("eoa");
	});

	it("preserves smart_account", () => {
		expect(parsePortfolioWalletKind("smart_account")).toBe("smart_account");
	});
});

describe("buildErc20TransferCall", () => {
	it("encodes transfer calldata", () => {
		const call = buildErc20TransferCall({
			token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
			to: "0x1111111111111111111111111111111111111111",
			amount: 1.5,
			decimals: 6,
		});

		expect(call.to).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
		expect(call.data.startsWith("0xa9059cbb")).toBe(true);
	});
});

describe("sendPortfolioContractCalls eoa path", () => {
	it("sends sequential transactions for EOA wallets", async () => {
		const context: PortfolioTransactionContext = {
			walletKind: "eoa",
			walletAddress: "0x2222222222222222222222222222222222222222",
			ownerPrivateKey:
				"0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			chainId: 8453,
			depositRpcUrl: "https://mainnet.base.org",
		};

		const hash = await sendPortfolioContractCalls(context, [
			buildErc20TransferCall({
				token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
				to: "0x1111111111111111111111111111111111111111",
				amount: 1,
				decimals: 6,
			}),
		]);

		expect(hash).toMatch(/^0x/);
	});
});
