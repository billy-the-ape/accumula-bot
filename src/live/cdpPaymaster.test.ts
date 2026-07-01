import { describe, expect, it } from "vitest";
import {
	buildPaymasterUsdcApprovalCall,
	getCdpErc20PaymasterAddress,
	humanizePaymasterError,
	MIN_GAS_PAYMENT_ALLOWANCE_UNITS,
	parseCdpGasPaymentMode,
	prependPaymasterApprovalIfNeeded,
	resolveGasPaymentUsdcToken,
} from "@/live/cdpPaymaster.js";

describe("parseCdpGasPaymentMode", () => {
	it("defaults to sponsor", () => {
		expect(parseCdpGasPaymentMode(undefined)).toBe("sponsor");
	});

	it("accepts usdc", () => {
		expect(parseCdpGasPaymentMode("usdc")).toBe("usdc");
	});
});

describe("humanizePaymasterError", () => {
	it("explains payment method not found", () => {
		const message = humanizePaymasterError(
			new Error("Details: payment method not found"),
		);

		expect(message).toContain("CDP_GAS_PAYMENT_MODE=sponsor");
		expect(message).toContain("ERC-20 gas payments");
	});
});

describe("resolveGasPaymentUsdcToken", () => {
	it("returns Base mainnet USDC for usdc mode", () => {
		expect(resolveGasPaymentUsdcToken(8453, "USDC", "usdc")).toBe(
			"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
		);
	});

	it("returns undefined for sponsor mode", () => {
		expect(resolveGasPaymentUsdcToken(8453, "USDC", "sponsor")).toBeUndefined();
	});
});

describe("prependPaymasterApprovalIfNeeded", () => {
	const usdcToken = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
	const mainCall = {
		to: "0x1111111111111111111111111111111111111111" as const,
		data: "0x" as const,
	};

	it("prepends approval when allowance is low", () => {
		const calls = prependPaymasterApprovalIfNeeded({
			calls: [mainCall],
			allowance: 0n,
			usdcToken,
			chainId: 8453,
		});

		expect(calls).toHaveLength(2);
		expect(calls[0]?.to).toBe(usdcToken);
		expect(calls[0]?.data.startsWith("0x095ea7b3")).toBe(true);
		expect(calls[1]).toEqual(mainCall);
	});

	it("skips approval when allowance is sufficient", () => {
		const calls = prependPaymasterApprovalIfNeeded({
			calls: [mainCall],
			allowance: MIN_GAS_PAYMENT_ALLOWANCE_UNITS,
			usdcToken,
			chainId: 8453,
		});

		expect(calls).toEqual([mainCall]);
	});
});

describe("buildPaymasterUsdcApprovalCall", () => {
	it("targets the CDP paymaster contract", () => {
		const call = buildPaymasterUsdcApprovalCall({
			usdcToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
			chainId: 8453,
		});

		expect(call.data).toContain(
			getCdpErc20PaymasterAddress(8453).slice(2).toLowerCase(),
		);
	});
});
