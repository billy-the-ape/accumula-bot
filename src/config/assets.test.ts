import { describe, expect, it } from "vitest";
import {
	getCryptocurrency,
	isUsdStablecoin,
	isUsdStablecoinSymbol,
	listRegistryAssets,
	normalizeRegistrySymbol,
	resolveCryptocurrencyForChain,
} from "@/config/assets.js";
import {
	BASE_CBTC,
	BASE_CHAIN_ID,
	BASE_LINK,
	BASE_RETH,
	BASE_SOL,
	BASE_USDC,
	BASE_WETH,
} from "@/config/baseChain.js";
import {
	assertSupportedDepositChainId,
	getChainEvmMetadata,
} from "@/config/chainAssets.js";
import { BASE_SEPOLIA_CHAIN_ID, SEPOLIA_USDC } from "@/config/sepoliaChain.js";
import { CryptocurrencySchema } from "@/schemas/Cryptocurrency.js";

describe("CRYPTOCURRENCY_REGISTRY", () => {
	it("includes all registry assets with taxonomy and mainnet EVM metadata", () => {
		const symbols = [
			"USDC",
			"EURC",
			"BTC",
			"ETH",
			"SOL",
			"cbETH",
			"wstETH",
			"rETH",
			"LINK",
		] as const;

		for (const symbol of symbols) {
			const asset = getCryptocurrency(symbol);
			expect(CryptocurrencySchema.safeParse(asset).success).toBe(true);
			expect(asset.evm?.chainId).toBe(BASE_CHAIN_ID);
			expect(asset.macroRiskCategory).toBeDefined();
			expect(asset.assetClass).toBeDefined();
		}
	});

	it("marks stables as risk_off stablecoins", () => {
		expect(getCryptocurrency("USDC")).toMatchObject({
			macroRiskCategory: "risk_off",
			assetClass: "stablecoin",
			isStable: true,
			pegCurrency: "USD",
			evm: BASE_USDC,
		});
		expect(getCryptocurrency("EURC")).toMatchObject({
			macroRiskCategory: "risk_off",
			pegCurrency: "EUR",
		});
	});

	it("identifies USD stablecoins by symbol", () => {
		expect(isUsdStablecoin(getCryptocurrency("USDC"))).toBe(true);
		expect(isUsdStablecoin(getCryptocurrency("EURC"))).toBe(false);
		expect(isUsdStablecoinSymbol("USDC")).toBe(true);
		expect(isUsdStablecoinSymbol("usdc")).toBe(true);
		expect(isUsdStablecoinSymbol("EURC")).toBe(false);
		expect(isUsdStablecoinSymbol("BTC")).toBe(false);
	});

	it("maps logical BTC/ETH to Base cbBTC/WETH contracts", () => {
		expect(getCryptocurrency("BTC").evm).toEqual(BASE_CBTC);
		expect(getCryptocurrency("ETH").evm).toEqual(BASE_WETH);
		expect(getCryptocurrency("SOL").evm).toEqual(BASE_SOL);
		expect(getCryptocurrency("rETH").evm?.contractAddress).toBe(
			BASE_RETH.contractAddress,
		);
		expect(getCryptocurrency("LINK").evm?.contractAddress).toBe(
			BASE_LINK.contractAddress,
		);
	});

	it("resolves Base Sepolia USDC when chain id is 84532", () => {
		const usdc = resolveCryptocurrencyForChain("USDC", BASE_SEPOLIA_CHAIN_ID);
		expect(usdc.evm).toEqual(SEPOLIA_USDC);
		expect(
			resolveCryptocurrencyForChain("BTC", BASE_SEPOLIA_CHAIN_ID).evm,
		).toBe(undefined);
	});

	it("lists nine registry assets", () => {
		expect(listRegistryAssets()).toHaveLength(9);
	});

	it("normalizes env symbols case-insensitively", () => {
		expect(normalizeRegistrySymbol("cbeth")).toBe("cbETH");
		expect(normalizeRegistrySymbol("WSTETH")).toBe("wstETH");
		expect(normalizeRegistrySymbol("btc")).toBe("BTC");
		expect(normalizeRegistrySymbol("DOGE")).toBeNull();
	});
});

describe("chainAssets", () => {
	it("accepts supported deposit chain ids", () => {
		expect(assertSupportedDepositChainId(8453)).toBe(8453);
		expect(assertSupportedDepositChainId(84532)).toBe(84532);
	});

	it("rejects unsupported deposit chain ids", () => {
		expect(() => assertSupportedDepositChainId(1)).toThrow(
			/DEPOSIT_CHAIN_ID must be 8453 or 84532/,
		);
	});

	it("returns Sepolia USDC metadata by chain", () => {
		expect(getChainEvmMetadata("USDC", BASE_SEPOLIA_CHAIN_ID)).toEqual(
			SEPOLIA_USDC,
		);
	});
});
