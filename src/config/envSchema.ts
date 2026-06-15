import z from "zod";
import {
	DEFAULT_LLM_PROVIDER,
	LlmProviderIdSchema,
} from "@/schemas/LlmProvider.js";

const DEFAULT_ASSET_TO_ACCUMULATE = "BTC";
const DEFAULT_ASSET_STARTING = "USDC";
const DEFAULT_LLM_MODEL = "qwen3:8b";
const DEFAULT_LLM_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_LLM_TEMPERATURE = 0.2;
export const DEFAULT_LLM_CONTEXT_TOKENS = 32_768;
export const DEFAULT_LLM_MAX_OUTPUT_TOKENS = 4_096;
const DEFAULT_DATABASE_PATH = "data/accumula.db";
const DEFAULT_COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";

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
			.min(1, "ASSET_TRADEABLE must list at least one asset"),
		ASSET_STARTING: z
			.string()
			.trim()
			.transform(parseAssetSymbol)
			.default(DEFAULT_ASSET_STARTING),
		LLM_PROVIDER: LlmProviderIdSchema.default(DEFAULT_LLM_PROVIDER),
		LLM_BASE_URL: z.url({ message: "LLM_BASE_URL must be a valid URL" }),
		LLM_MODEL: z.string().trim().min(1).default(DEFAULT_LLM_MODEL),
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
		TWITTER_SEARCH_MAX_PAGES: z.coerce.number().int().positive().optional(),
	})
	.transform((env) => ({
		assetToAccumulateSymbol: env.ASSET_TO_ACCUMULATE,
		assetTradeableSymbols: parseCommaSeparatedSymbols(env.ASSET_TRADEABLE),
		assetStartingSymbol: env.ASSET_STARTING,
		llm: {
			provider: env.LLM_PROVIDER,
			baseUrl: env.LLM_BASE_URL,
			model: env.LLM_MODEL,
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
		twitter: {
			searchString: env.TWITTER_SEARCH_STRING,
			searchMaxPages: env.TWITTER_SEARCH_MAX_PAGES,
			cloudamqpUrl: env.CLOUDAMQP_URL,
		},
		databasePath: env.DATABASE_PATH,
		coingecko: {
			baseUrl: env.COINGECKO_BASE_URL,
			apiKey: env.COINGECKO_API_KEY,
		},
	}));

export type ParsedEnv = z.infer<typeof RawEnvSchema>;
