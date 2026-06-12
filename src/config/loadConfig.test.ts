import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "@/config/loadConfig.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";

const validEnv = {
	ASSET_TO_ACCUMULATE: "btc",
	ASSET_TRADEABLE: "BTC, ETH, SOL, USDC",
	ASSET_STARTING: "USDC",
	LLM_BASE_URL: "http://127.0.0.1:11434",
	LLM_MODEL: "qwen3:8b",
};

describe("loadConfig", () => {
	it("parses env vars into structured config with defaults", () => {
		const config = loadConfig(validEnv);

		expect(config.assetToAccumulate.symbol).toBe("BTC");
		expect(config.assetStarting.symbol).toBe("USDC");
		expect(
			config.assetTradeable.map((asset: Cryptocurrency) => asset.symbol),
		).toEqual(["BTC", "ETH", "SOL", "USDC"]);
		expect(config.llm).toEqual({
			provider: "openai_compatible",
			baseUrl: "http://127.0.0.1:11434",
			model: "qwen3:8b",
		});
		expect(config.exchange).toBeUndefined();
	});

	it("applies asset and LLM defaults when optional env vars are omitted", () => {
		const config = loadConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});

		expect(config.assetToAccumulate.symbol).toBe("BTC");
		expect(config.assetStarting.symbol).toBe("USDC");
		expect(config.llm.provider).toBe("openai_compatible");
		expect(config.llm.baseUrl).toBe("http://127.0.0.1:11434");
		expect(config.llm.model).toBe("qwen3:8b");
	});

	it("loads anthropic provider when configured with explicit base URL", () => {
		const config = loadConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_PROVIDER: "anthropic",
			LLM_BASE_URL: "https://api.anthropic.com",
			LLM_API_KEY: "anthropic-key",
			LLM_MODEL: "claude-3-5-sonnet-20241022",
		});

		expect(config.llm.provider).toBe("anthropic");
		expect(config.llm.baseUrl).toBe("https://api.anthropic.com");
		expect(config.llm.apiKey).toBe("anthropic-key");
	});

	it("rejects missing LLM base URL", () => {
		expect(() =>
			loadConfig({
				ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			}),
		).toThrow(ConfigError);
	});

	it("rejects anthropic provider without an API key", () => {
		expect(() =>
			loadConfig({
				...validEnv,
				LLM_PROVIDER: "anthropic",
			}),
		).toThrow(/LLM_API_KEY is required when LLM_PROVIDER=anthropic/i);
	});

	it("includes LLM API key when provided", () => {
		const config = loadConfig({
			...validEnv,
			LLM_API_KEY: "sk-test",
		});

		expect(config.llm.apiKey).toBe("sk-test");
	});

	it("includes exchange credentials when both are provided", () => {
		const config = loadConfig({
			...validEnv,
			EXCHANGE_API_KEY: "key",
			EXCHANGE_API_SECRET: "secret",
		});

		expect(config.exchange).toEqual({
			apiKey: "key",
			apiSecret: "secret",
		});
	});

	it("rejects unknown assets", () => {
		expect(() =>
			loadConfig({
				...validEnv,
				ASSET_TRADEABLE: "BTC,DOGE,USDC",
			}),
		).toThrow(ConfigError);
	});

	it("rejects duplicate tradeable assets", () => {
		expect(() =>
			loadConfig({
				...validEnv,
				ASSET_TRADEABLE: "BTC,BTC,ETH,USDC",
			}),
		).toThrow(/duplicate assets/i);
	});

	it("rejects starting asset not listed in tradeable assets", () => {
		expect(() =>
			loadConfig({
				...validEnv,
				ASSET_TRADEABLE: "BTC,ETH,SOL",
				ASSET_STARTING: "USDC",
			}),
		).toThrow(/ASSET_STARTING must be included in ASSET_TRADEABLE/i);
	});

	it("rejects accumulate asset not listed in tradeable assets", () => {
		expect(() =>
			loadConfig({
				...validEnv,
				ASSET_TO_ACCUMULATE: "BTC",
				ASSET_TRADEABLE: "ETH,SOL,USDC",
				ASSET_STARTING: "USDC",
			}),
		).toThrow(/ASSET_TO_ACCUMULATE must be included in ASSET_TRADEABLE/i);
	});

	it("rejects partial exchange credentials", () => {
		expect(() =>
			loadConfig({
				...validEnv,
				EXCHANGE_API_KEY: "key",
			}),
		).toThrow(/both be set or both be omitted/i);
	});

	it("rejects invalid LLM base URL", () => {
		expect(() =>
			loadConfig({
				...validEnv,
				LLM_BASE_URL: "not-a-url",
			}),
		).toThrow(ConfigError);
	});

	it("rejects empty tradeable asset list", () => {
		expect(() =>
			loadConfig({
				...validEnv,
				ASSET_TRADEABLE: "   ",
			}),
		).toThrow(ConfigError);
	});
});
