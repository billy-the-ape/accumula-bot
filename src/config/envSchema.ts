import z from "zod";
import { BASE_CHAIN_ID } from "@/config/baseChain.js";
import { isSupportedDepositChainId } from "@/config/depositChains.js";
import {
	DEFAULT_LLM_PROVIDER,
	LlmProviderIdSchema,
} from "@/schemas/LlmProvider.js";

const DEFAULT_ASSET_TO_ACCUMULATE = "BTC";
const DEFAULT_ASSET_STARTING = "USDC";
/** Option A basket — yield tokens (cbETH, wstETH, rETH) stay in registry; add via ASSET_TRADEABLE to enable. */
const DEFAULT_ASSET_TRADEABLE = "BTC,ETH,SOL,USDC,EURC,LINK";
const DEFAULT_LIVE_MIN_DEPOSIT_USD = 1000;
const DEFAULT_DEPOSIT_RPC_URL = "https://mainnet.base.org";
const DEFAULT_DEPOSIT_CHAIN_ID = BASE_CHAIN_ID;
const DEFAULT_LIVE_MAX_SLIPPAGE_BPS = 100;
const DEFAULT_LIVE_GAS_BOOTSTRAP_USD = 3;
const DEFAULT_WITHDRAWAL_PROFIT_FEE_BPS = 500;
const DEFAULT_CATEGORY_MAX_RISK_ON_FRACTION = 0.85;
const DEFAULT_CDP_GAS_PAYMENT_MODE = "sponsor";
const DEFAULT_LLM_MODEL = "qwen3:8b";
const DEFAULT_LLM_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_LLM_TEMPERATURE = 0.2;
export const DEFAULT_LLM_CONTEXT_TOKENS = 32_768;
export const DEFAULT_LLM_MAX_OUTPUT_TOKENS = 4_096;
const DEFAULT_DATABASE_PATH = "data/accumula.db";
const DEFAULT_COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";
const DEFAULT_KALSHI_BASE_URL = "https://external-api.kalshi.com/trade-api/v2";
const DEFAULT_POLYMARKET_GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const DEFAULT_POLYMARKET_CLOB_BASE_URL = "https://clob.polymarket.com";
const DEFAULT_PREDICTION_MARKETS_HORIZON_HOURS = 24;
const DEFAULT_PREDICTION_MARKETS_NORMALIZATION_BAND_PCT = 0.05;
const DEFAULT_PREDICTION_MARKETS_MAX_RUNGS = 6;
const DEFAULT_PREDICTION_MARKETS_MIN_RUNGS = 3;
const DEFAULT_PREDICTION_MARKETS_MIN_RUNG_LIQUIDITY_USD = 1_000;

const DEFAULT_TWITTER_SEARCH_MAX_PAGES = 1;

const DEFAULT_BUY_MIN_DIRECTION_SCORE = 6.9;
const DEFAULT_SELL_MAX_DIRECTION_SCORE = 3.9;
const DEFAULT_MIN_CONFIDENCE = 0.67;

function parseCommaSeparatedSymbols(value: string): string[] {
	return value
		.split(",")
		.map((part) => part.trim().toUpperCase())
		.filter((part) => part.length > 0);
}

function parseAssetSymbol(value: string): string {
	return value.trim().toUpperCase();
}

export const RawEnvSchema = z
	.object({
		ASSET_TO_ACCUMULATE: z
			.string()
			.trim()
			.transform(parseAssetSymbol)
			.default(DEFAULT_ASSET_TO_ACCUMULATE),
		ASSET_TRADEABLE: z
			.string()
			.trim()
			.min(1, "ASSET_TRADEABLE must list at least one asset")
			.default(DEFAULT_ASSET_TRADEABLE),
		ASSET_STARTING: z
			.string()
			.trim()
			.transform(parseAssetSymbol)
			.default(DEFAULT_ASSET_STARTING),
		LLM_PROVIDER: LlmProviderIdSchema.default(DEFAULT_LLM_PROVIDER),
		LLM_BASE_URL: z.url({ message: "LLM_BASE_URL must be a valid URL" }),
		LLM_MODEL: z.string().trim().min(1).default(DEFAULT_LLM_MODEL),
		LLM_FAST_MODEL: z.string().trim().min(1).optional(),
		LLM_REQUEST_TIMEOUT_MS: z.coerce
			.number()
			.int()
			.positive()
			.default(DEFAULT_LLM_REQUEST_TIMEOUT_MS),
		LLM_TEMPERATURE: z.coerce
			.number()
			.min(0)
			.max(2)
			.default(DEFAULT_LLM_TEMPERATURE),
		LLM_CONTEXT_TOKENS: z.coerce
			.number()
			.int()
			.min(2048)
			.default(DEFAULT_LLM_CONTEXT_TOKENS),
		LLM_MAX_OUTPUT_TOKENS: z.coerce
			.number()
			.int()
			.positive()
			.default(DEFAULT_LLM_MAX_OUTPUT_TOKENS),
		LLM_API_KEY: z.string().trim().min(1).optional(),
		DATABASE_PATH: z.string().trim().min(1).default(DEFAULT_DATABASE_PATH),
		COINGECKO_BASE_URL: z.url().default(DEFAULT_COINGECKO_BASE_URL),
		COINGECKO_API_KEY: z.string().trim().min(1).optional(),
		EXCHANGE_API_KEY: z.string().trim().optional(),
		EXCHANGE_API_SECRET: z.string().trim().optional(),
		TELEGRAM_BOT_TOKEN: z.string().trim().min(1).optional(),
		TELEGRAM_CHAT_ID: z.string().trim().min(1).optional(),
		CLOUDAMQP_URL: z.string().trim().min(1),
		TWITTER_SEARCH_STRING: z.string().trim().min(1).optional(),
		TWITTER_SEARCH_MAX_PAGES: z.coerce
			.number()
			.int()
			.positive()
			.default(DEFAULT_TWITTER_SEARCH_MAX_PAGES),
		PREDICTION_MARKETS_ENABLED: z
			.string()
			.trim()
			.optional()
			.transform((value) => value === "true" || value === "1"),
		KALSHI_BASE_URL: z.url().default(DEFAULT_KALSHI_BASE_URL),
		POLYMARKET_GAMMA_BASE_URL: z
			.url()
			.default(DEFAULT_POLYMARKET_GAMMA_BASE_URL),
		POLYMARKET_CLOB_BASE_URL: z.url().default(DEFAULT_POLYMARKET_CLOB_BASE_URL),
		PREDICTION_MARKETS_HORIZON_HOURS: z.coerce
			.number()
			.positive()
			.default(DEFAULT_PREDICTION_MARKETS_HORIZON_HOURS),
		PREDICTION_MARKETS_NORMALIZATION_BAND_PCT: z.coerce
			.number()
			.positive()
			.max(1)
			.default(DEFAULT_PREDICTION_MARKETS_NORMALIZATION_BAND_PCT),
		PREDICTION_MARKETS_MAX_RUNGS: z.coerce
			.number()
			.int()
			.min(2)
			.default(DEFAULT_PREDICTION_MARKETS_MAX_RUNGS),
		PREDICTION_MARKETS_MIN_RUNGS: z.coerce
			.number()
			.int()
			.min(2)
			.default(DEFAULT_PREDICTION_MARKETS_MIN_RUNGS),
		PREDICTION_MARKETS_MIN_RUNG_LIQUIDITY_USD: z.coerce
			.number()
			.nonnegative()
			.default(DEFAULT_PREDICTION_MARKETS_MIN_RUNG_LIQUIDITY_USD),

		SOCIAL_MEDIA_ENABLED: z
			.string()
			.trim()
			.optional()
			.transform((value) => value === "true" || value === "1"),

		VERBOSE_PROMPT_LOGS: z
			.string()
			.trim()
			.optional()
			.transform((value) => value === "true" || value === "1"),

		BUY_MIN_DIRECTION_SCORE: z.coerce
			.number()
			.min(5)
			.max(10)
			.default(DEFAULT_BUY_MIN_DIRECTION_SCORE),
		SELL_MAX_DIRECTION_SCORE: z.coerce
			.number()
			.min(0)
			.max(5)
			.default(DEFAULT_SELL_MAX_DIRECTION_SCORE),
		MIN_CONFIDENCE: z.coerce
			.number()
			.min(0)
			.max(1)
			.default(DEFAULT_MIN_CONFIDENCE),

		LIVE_MIN_DEPOSIT_USD: z.coerce
			.number()
			.positive()
			.default(DEFAULT_LIVE_MIN_DEPOSIT_USD),
		DEPOSIT_RPC_URL: z.url().default(DEFAULT_DEPOSIT_RPC_URL),
		DEPOSIT_CHAIN_ID: z.coerce
			.number()
			.int()
			.positive()
			.refine(isSupportedDepositChainId, {
				message:
					"DEPOSIT_CHAIN_ID must be 8453 (Base mainnet) or 84532 (Base Sepolia)",
			})
			.default(DEFAULT_DEPOSIT_CHAIN_ID),
		WALLET_ENCRYPTION_KEY: z.string().trim().min(1).optional(),
		ZEROX_API_KEY: z.string().trim().min(1).optional(),
		LIVE_MAX_SLIPPAGE_BPS: z.coerce
			.number()
			.int()
			.min(1)
			.max(1000)
			.default(DEFAULT_LIVE_MAX_SLIPPAGE_BPS),
		LIVE_GAS_BOOTSTRAP_USD: z.coerce
			.number()
			.positive()
			.max(50)
			.default(DEFAULT_LIVE_GAS_BOOTSTRAP_USD),
		WITHDRAWAL_PROFIT_FEE_BPS: z.coerce
			.number()
			.int()
			.min(0)
			.max(10_000)
			.default(DEFAULT_WITHDRAWAL_PROFIT_FEE_BPS),
		WITHDRAWAL_TREASURY_ADDRESS: z
			.string()
			.trim()
			.regex(/^0x[a-fA-F0-9]{40}$/, "Invalid treasury address")
			.optional(),
		CDP_PAYMASTER_RPC_URL: z.url().optional(),
		CDP_GAS_PAYMENT_MODE: z
			.preprocess(
				(value) => (typeof value === "string" ? value.trim() : value),
				z.enum(["sponsor", "usdc"]),
			)
			.default(DEFAULT_CDP_GAS_PAYMENT_MODE),
		CATEGORY_MAX_RISK_ON_FRACTION: z.coerce
			.number()
			.min(0)
			.max(1)
			.default(DEFAULT_CATEGORY_MAX_RISK_ON_FRACTION),
	})
	.transform((env) => ({
		assetToAccumulateSymbol: env.ASSET_TO_ACCUMULATE,
		assetTradeableSymbols: parseCommaSeparatedSymbols(env.ASSET_TRADEABLE),
		assetStartingSymbol: env.ASSET_STARTING,
		llm: {
			provider: env.LLM_PROVIDER,
			baseUrl: env.LLM_BASE_URL,
			model: env.LLM_MODEL,
			fastModel: env.LLM_FAST_MODEL || env.LLM_MODEL,
			requestTimeoutMs: env.LLM_REQUEST_TIMEOUT_MS,
			temperature: env.LLM_TEMPERATURE,
			contextTokens: env.LLM_CONTEXT_TOKENS,
			maxOutputTokens: env.LLM_MAX_OUTPUT_TOKENS,
			apiKey: env.LLM_API_KEY,
		},
		exchange: {
			apiKey: env.EXCHANGE_API_KEY,
			apiSecret: env.EXCHANGE_API_SECRET,
		},
		telegram: {
			botToken: env.TELEGRAM_BOT_TOKEN,
			chatId: env.TELEGRAM_CHAT_ID,
		},
		databasePath: env.DATABASE_PATH,
		coingecko: {
			baseUrl: env.COINGECKO_BASE_URL,
			apiKey: env.COINGECKO_API_KEY,
		},
		socialMedia: {
			enabled: env.SOCIAL_MEDIA_ENABLED,

			twitterConfig: {
				searchString: env.TWITTER_SEARCH_STRING,
				searchMaxPages: env.TWITTER_SEARCH_MAX_PAGES,
				cloudamqpUrl: env.CLOUDAMQP_URL,
			},
		},
		predictionMarkets: {
			enabled: env.PREDICTION_MARKETS_ENABLED,
			kalshiBaseUrl: env.KALSHI_BASE_URL,
			polymarketGammaBaseUrl: env.POLYMARKET_GAMMA_BASE_URL,
			polymarketClobBaseUrl: env.POLYMARKET_CLOB_BASE_URL,
			targetHorizonHours: env.PREDICTION_MARKETS_HORIZON_HOURS,
			scoring: {
				normalizationBandPct: env.PREDICTION_MARKETS_NORMALIZATION_BAND_PCT,
				maxRungs: env.PREDICTION_MARKETS_MAX_RUNGS,
				minRungs: env.PREDICTION_MARKETS_MIN_RUNGS,
				minRungLiquidityUsd: env.PREDICTION_MARKETS_MIN_RUNG_LIQUIDITY_USD,
			},
		},
		outlookThresholds: {
			buyMinDirectionScore: env.BUY_MIN_DIRECTION_SCORE,
			sellMaxDirectionScore: env.SELL_MAX_DIRECTION_SCORE,
			minConfidence: env.MIN_CONFIDENCE,
		},
		verbosePromptLogs: env.VERBOSE_PROMPT_LOGS,
		liveMinDepositUsd: env.LIVE_MIN_DEPOSIT_USD,
		depositRpcUrl: env.DEPOSIT_RPC_URL,
		depositChainId: env.DEPOSIT_CHAIN_ID,
		walletEncryptionKey: env.WALLET_ENCRYPTION_KEY,
		zeroXApiKey: env.ZEROX_API_KEY,
		liveMaxSlippageBps: env.LIVE_MAX_SLIPPAGE_BPS,
		liveGasBootstrapUsd: env.LIVE_GAS_BOOTSTRAP_USD,
		withdrawalProfitFeeBps: env.WITHDRAWAL_PROFIT_FEE_BPS,
		withdrawalTreasuryAddress: env.WITHDRAWAL_TREASURY_ADDRESS,
		cdpPaymasterRpcUrl: env.CDP_PAYMASTER_RPC_URL,
		cdpGasPaymentMode: env.CDP_GAS_PAYMENT_MODE,
		categoryMaxRiskOnFraction: env.CATEGORY_MAX_RISK_ON_FRACTION,
	}));

export type ParsedEnv = z.infer<typeof RawEnvSchema>;
