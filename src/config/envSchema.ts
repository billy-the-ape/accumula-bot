import z from "zod";
import {
	DEFAULT_LLM_PROVIDER,
	LlmProviderIdSchema,
} from "@/schemas/LlmProvider.js";

const DEFAULT_ASSET_TO_ACCUMULATE = "BTC";
const DEFAULT_ASSET_STARTING = "USDC";
const DEFAULT_LLM_MODEL = "qwen3:8b";
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
		LLM_API_KEY: z.string().trim().min(1).optional(),
		DATABASE_PATH: z.string().trim().min(1).default(DEFAULT_DATABASE_PATH),
		COINGECKO_BASE_URL: z.url().default(DEFAULT_COINGECKO_BASE_URL),
		COINGECKO_API_KEY: z.string().trim().min(1).optional(),
		EXCHANGE_API_KEY: z.string().trim().optional(),
		EXCHANGE_API_SECRET: z.string().trim().optional(),
	})
	.transform((env) => ({
		assetToAccumulateSymbol: env.ASSET_TO_ACCUMULATE,
		assetTradeableSymbols: parseCommaSeparatedSymbols(env.ASSET_TRADEABLE),
		assetStartingSymbol: env.ASSET_STARTING,
		llm: {
			provider: env.LLM_PROVIDER,
			baseUrl: env.LLM_BASE_URL,
			model: env.LLM_MODEL,
			apiKey: env.LLM_API_KEY,
		},
		exchange: {
			apiKey: env.EXCHANGE_API_KEY,
			apiSecret: env.EXCHANGE_API_SECRET,
		},
		databasePath: env.DATABASE_PATH,
		coingecko: {
			baseUrl: env.COINGECKO_BASE_URL,
			apiKey: env.COINGECKO_API_KEY,
		},
	}));

export type ParsedEnv = z.infer<typeof RawEnvSchema>;
