import { describe, expect, it } from "vitest";
import { predictionMarketSource } from "@/analysis/sources/predictionMarketSource.js";
import { getCryptocurrency } from "@/config/assets.js";
import { loadTestConfig } from "@/config/loadTestConfig.js";

function makeConfig(env: Record<string, string | undefined> = {}) {
	return loadTestConfig({
		ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
		LLM_BASE_URL: "http://127.0.0.1:11434",
		...env,
	});
}

describe("predictionMarketSource", () => {
	it("is disabled by default and enabled via config flag", () => {
		expect(predictionMarketSource.isEnabled(makeConfig())).toBe(false);
		expect(
			predictionMarketSource.isEnabled(
				makeConfig({ PREDICTION_MARKETS_ENABLED: "true" }),
			),
		).toBe(true);
	});

	it("returns a normalized section (no network for unmapped assets)", async () => {
		const config = makeConfig({ PREDICTION_MARKETS_ENABLED: "true" });

		// SOL has no market mapping, so no client/network calls are made.
		const section = await predictionMarketSource.fetch(config, [
			getCryptocurrency("USDC"),
		]);

		expect(section.sourceId).toBe("prediction_markets");
		expect(section.label).toBe("Prediction markets");
		expect(section.payload).toEqual([]);
		expect(section.promptText).toContain(
			"USDC:\n  no prediction-market signal available",
		);
	});
});
