import { describe, expect, it } from "vitest";
import { getCryptocurrency } from "@/config/assets.js";
import {
	filterNonStableAssets,
	isStablecoin,
	isSymbolTradeable,
} from "@/domain/whitelist.js";

describe("whitelist", () => {
	it("identifies stablecoins", () => {
		expect(isStablecoin(getCryptocurrency("USDC"))).toBe(true);
		expect(isStablecoin(getCryptocurrency("BTC"))).toBe(false);
	});

	it("filters non-stable tradeable assets", () => {
		const assets = [
			getCryptocurrency("BTC"),
			getCryptocurrency("ETH"),
			getCryptocurrency("USDC"),
		];

		expect(filterNonStableAssets(assets).map((asset) => asset.symbol)).toEqual([
			"BTC",
			"ETH",
		]);
	});

	it("checks whether a symbol is in the tradeable list", () => {
		const tradeable = [getCryptocurrency("BTC"), getCryptocurrency("USDC")];

		expect(isSymbolTradeable("BTC", tradeable)).toBe(true);
		expect(isSymbolTradeable("SOL", tradeable)).toBe(false);
	});
});
