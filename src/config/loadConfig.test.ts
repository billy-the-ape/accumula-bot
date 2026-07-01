import { describe, expect, it } from "vitest";
import {
	DEFAULT_LLM_CONTEXT_TOKENS,
	DEFAULT_LLM_MAX_OUTPUT_TOKENS,
	DEFAULT_LLM_TEMPERATURE,
} from "@/config/envSchema.js";
import { ConfigError, loadConfig } from "@/config/loadConfig.js";
import { DEFAULT_LLM_REQUEST_TIMEOUT_MS } from "@/llm/requestTimeout.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";

const validEnv = {
	CLOUDAMQP_URL: "amqp://localhost",
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
			provider: "ollama",
			baseUrl: "http://127.0.0.1:11434",
			model: "qwen3:8b",
			fastModel: "qwen3:8b",
			requestTimeoutMs: DEFAULT_LLM_REQUEST_TIMEOUT_MS,
			temperature: DEFAULT_LLM_TEMPERATURE,
			contextTokens: DEFAULT_LLM_CONTEXT_TOKENS,
			maxOutputTokens: DEFAULT_LLM_MAX_OUTPUT_TOKENS,
		});
		expect(config.databasePath).toBe("data/accumula.db");
		expect(config.exchange).toBeUndefined();
		expect(config.verbosePromptLogs).toBe(false);
	});

	it("applies asset and LLM defaults when optional env vars are omitted", () => {
		const config = loadConfig({
			...validEnv,
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_BASE_URL: "http://127.0.0.1:11434",
		});

		expect(config.assetToAccumulate.symbol).toBe("BTC");
		expect(config.assetStarting.symbol).toBe("USDC");
		expect(config.llm.provider).toBe("ollama");
		expect(config.llm.baseUrl).toBe("http://127.0.0.1:11434");
		expect(config.llm.model).toBe("qwen3:8b");
	});

	it("loads anthropic provider when configured with explicit base URL", () => {
		const config = loadConfig({
			...validEnv,
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

	it("enables verbose prompt logging when VERBOSE_PROMPT_LOGS=true", () => {
		const config = loadConfig({
			...validEnv,
			VERBOSE_PROMPT_LOGS: "true",
		});

		expect(config.verbosePromptLogs).toBe(true);
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

	it("allows overriding the LLM request timeout", () => {
		const config = loadConfig({
			...validEnv,
			LLM_REQUEST_TIMEOUT_MS: "3600000",
		});

		expect(config.llm.requestTimeoutMs).toBe(3_600_000);
	});

	it("allows overriding the LLM temperature", () => {
		const config = loadConfig({
			...validEnv,
			LLM_TEMPERATURE: "0.1",
		});

		expect(config.llm.temperature).toBe(0.1);
	});

	it("allows overriding LLM context and output token limits", () => {
		const config = loadConfig({
			...validEnv,
			LLM_CONTEXT_TOKENS: "65536",
			LLM_MAX_OUTPUT_TOKENS: "8192",
		});

		expect(config.llm.contextTokens).toBe(65_536);
		expect(config.llm.maxOutputTokens).toBe(8_192);
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

	it("includes Telegram credentials when both are provided", () => {
		const config = loadConfig({
			...validEnv,
			TELEGRAM_BOT_TOKEN: "bot-token",
			TELEGRAM_CHAT_ID: "12345",
		});

		expect(config.telegram).toEqual({
			botToken: "bot-token",
			chatId: "12345",
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

	it("accepts full v1 Base asset basket", () => {
		const config = loadConfig({
			...validEnv,
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC,EURC,cbETH,wstETH,rETH,LINK",
		});

		expect(config.assetTradeable.map((asset) => asset.symbol)).toEqual([
			"BTC",
			"ETH",
			"SOL",
			"USDC",
			"EURC",
			"cbETH",
			"wstETH",
			"rETH",
			"LINK",
		]);
		expect(
			config.assetTradeable.every((asset) => asset.evm?.chainId === 8453),
		).toBe(true);
	});

	it("parses macro risk category on tradeable assets", () => {
		const config = loadConfig({
			...validEnv,
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC,EURC",
		});

		const usdc = config.assetTradeable.find((a) => a.symbol === "USDC");
		const eth = config.assetTradeable.find((a) => a.symbol === "ETH");
		expect(usdc?.macroRiskCategory).toBe("risk_off");
		expect(eth?.macroRiskCategory).toBe("risk_on");
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

	it("allows Telegram bot token without chat id", () => {
		const config = loadConfig({
			...validEnv,
			TELEGRAM_BOT_TOKEN: "bot-token",
		});

		expect(config.telegram).toEqual({
			botToken: "bot-token",
		});
	});

	it("rejects Telegram chat id without bot token", () => {
		expect(() =>
			loadConfig({
				...validEnv,
				TELEGRAM_CHAT_ID: "12345",
			}),
		).toThrow(/TELEGRAM_CHAT_ID requires TELEGRAM_BOT_TOKEN/i);
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

	it("applies live deposit defaults", () => {
		const config = loadConfig(validEnv);

		expect(config.live.minDepositUsd).toBe(1000);
		expect(config.live.depositRpcUrl).toBe("https://mainnet.base.org");
		expect(config.live.depositChainId).toBe(8453);
	});

	it("allows overriding deposit RPC and chain id for testnet", () => {
		const config = loadConfig({
			...validEnv,
			DEPOSIT_RPC_URL: "https://sepolia.base.org",
			DEPOSIT_CHAIN_ID: "84532",
		});

		expect(config.live.depositRpcUrl).toBe("https://sepolia.base.org");
		expect(config.live.depositChainId).toBe(84532);
		expect(config.assetStarting.evm?.chainId).toBe(84532);
	});

	it("rejects unsupported DEPOSIT_CHAIN_ID", () => {
		expect(() =>
			loadConfig({
				...validEnv,
				DEPOSIT_CHAIN_ID: "42161",
			}),
		).toThrow(
			/DEPOSIT_CHAIN_ID must be 8453 \(Base mainnet\) or 84532 \(Base Sepolia\)/,
		);
	});
});
