import { describe, expect, it } from "vitest";
import { getCryptocurrency } from "@/config/assets.js";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import {
	formatAssetTaxonomyForPrompt,
	listAssetsInCategory,
} from "@/llm/formatAssetTaxonomy.js";

describe("formatAssetTaxonomyForPrompt", () => {
	it("groups tradeable assets by macro risk category", () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC,EURC,cbETH,wstETH,rETH,LINK",
		});

		const text = formatAssetTaxonomyForPrompt(config.assetTradeable);

		expect(text).toContain("Asset taxonomy");
		expect(text).toContain("risk_off");
		expect(text).toContain("USDC (USD Coin");
		expect(text).toContain("EURC (Euro Coin");
		expect(text).toContain("BTC (Bitcoin");
		expect(text).toContain("ETH (Ethereum");
		expect(text).toContain("risk_on");
		expect(text).toContain("In risk-off macro regimes");
	});

	it("lists assets in a category", () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
		});

		const riskOn = listAssetsInCategory(config.assetTradeable, "risk_on");
		expect(riskOn.map((asset) => asset.symbol)).toEqual(["ETH", "SOL"]);
	});

	it("includes yield-bearing assets under neutral", () => {
		const assets = [getCryptocurrency("cbETH"), getCryptocurrency("wstETH")];
		const text = formatAssetTaxonomyForPrompt(assets);

		expect(text).toContain("neutral");
		expect(text).toContain("yield");
		expect(text).toContain("cbETH");
	});
});
