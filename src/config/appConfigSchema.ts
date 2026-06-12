import z from "zod";
import {
	CRYPTOCURRENCY_REGISTRY,
	type CryptocurrencySymbol,
	getCryptocurrency,
	isKnownCryptocurrencySymbol,
} from "@/config/assets.js";
import type { ParsedEnv } from "@/config/envSchema.js";
import {
	type Cryptocurrency,
	CryptocurrencySchema,
} from "@/schemas/Cryptocurrency.js";
import type { LlmProviderId } from "@/schemas/LlmProvider.js";

const LlmConfigSchema = z.object({
	provider: z.enum(["openai_compatible", "anthropic"]),
	baseUrl: z.url(),
	model: z.string().min(1),
	apiKey: z.string().min(1).optional(),
});

const ExchangeConfigSchema = z.object({
	apiKey: z.string().min(1),
	apiSecret: z.string().min(1),
});

export type LlmConfig = {
	provider: LlmProviderId;
	baseUrl: string;
	model: string;
	apiKey?: string;
};

export type AppConfig = {
	assetToAccumulate: Cryptocurrency;
	assetTradeable: Cryptocurrency[];
	assetStarting: Cryptocurrency;
	llm: LlmConfig;
	exchange?: z.infer<typeof ExchangeConfigSchema>;
};

function listUnknownSymbols(symbols: string[]): string[] {
	return symbols.filter((symbol) => !isKnownCryptocurrencySymbol(symbol));
}

function assertSymbolInTradeableList(
	symbol: string,
	tradeableSymbols: string[],
	fieldName: string,
	ctx: z.RefinementCtx,
): void {
	if (!tradeableSymbols.includes(symbol)) {
		ctx.addIssue({
			code: "custom",
			message: `${fieldName} must be included in ASSET_TRADEABLE`,
		});
	}
}

export const AppConfigSchema = z
	.custom<ParsedEnv>()
	.superRefine((env, ctx) => {
		const unknownToAccumulate = listUnknownSymbols([
			env.assetToAccumulateSymbol,
		]);
		if (unknownToAccumulate.length > 0) {
			const known = Object.keys(CRYPTOCURRENCY_REGISTRY).join(", ");
			ctx.addIssue({
				code: "custom",
				message: `ASSET_TO_ACCUMULATE contains unknown asset(s): ${unknownToAccumulate.join(", ")}. Known assets: ${known}`,
			});
		}

		const unknownTradeable = listUnknownSymbols(env.assetTradeableSymbols);
		if (unknownTradeable.length > 0) {
			const known = Object.keys(CRYPTOCURRENCY_REGISTRY).join(", ");
			ctx.addIssue({
				code: "custom",
				message: `ASSET_TRADEABLE contains unknown asset(s): ${unknownTradeable.join(", ")}. Known assets: ${known}`,
			});
		}

		const unknownStarting = listUnknownSymbols([env.assetStartingSymbol]);
		if (unknownStarting.length > 0) {
			const known = Object.keys(CRYPTOCURRENCY_REGISTRY).join(", ");
			ctx.addIssue({
				code: "custom",
				message: `ASSET_STARTING contains unknown asset(s): ${unknownStarting.join(", ")}. Known assets: ${known}`,
			});
		}

		const uniqueTradeable = new Set(env.assetTradeableSymbols);
		if (uniqueTradeable.size !== env.assetTradeableSymbols.length) {
			ctx.addIssue({
				code: "custom",
				message: "ASSET_TRADEABLE must not contain duplicate assets",
			});
		}

		assertSymbolInTradeableList(
			env.assetToAccumulateSymbol,
			env.assetTradeableSymbols,
			"ASSET_TO_ACCUMULATE",
			ctx,
		);
		assertSymbolInTradeableList(
			env.assetStartingSymbol,
			env.assetTradeableSymbols,
			"ASSET_STARTING",
			ctx,
		);

		const hasApiKey = env.exchange.apiKey !== undefined;
		const hasApiSecret = env.exchange.apiSecret !== undefined;
		if (hasApiKey !== hasApiSecret) {
			ctx.addIssue({
				code: "custom",
				message:
					"EXCHANGE_API_KEY and EXCHANGE_API_SECRET must both be set or both be omitted",
			});
		}

		if (env.llm.provider === "anthropic" && !env.llm.apiKey) {
			ctx.addIssue({
				code: "custom",
				message: "LLM_API_KEY is required when LLM_PROVIDER=anthropic",
			});
		}
	})
	.transform((env): AppConfig => {
		const assetToAccumulate = CryptocurrencySchema.parse(
			getCryptocurrency(env.assetToAccumulateSymbol as CryptocurrencySymbol),
		);
		const assetTradeable = env.assetTradeableSymbols.map((symbol) =>
			CryptocurrencySchema.parse(
				getCryptocurrency(symbol as CryptocurrencySymbol),
			),
		);
		const assetStarting = CryptocurrencySchema.parse(
			getCryptocurrency(env.assetStartingSymbol as CryptocurrencySymbol),
		);
		const llmPayload = LlmConfigSchema.parse(env.llm);
		const llm: LlmConfig = {
			provider: llmPayload.provider,
			baseUrl: llmPayload.baseUrl,
			model: llmPayload.model,
			...(llmPayload.apiKey ? { apiKey: llmPayload.apiKey } : {}),
		};

		const hasApiKey = env.exchange.apiKey !== undefined;
		const hasApiSecret = env.exchange.apiSecret !== undefined;
		if (hasApiKey && hasApiSecret) {
			return {
				assetToAccumulate,
				assetTradeable,
				assetStarting,
				llm,
				exchange: ExchangeConfigSchema.parse({
					apiKey: env.exchange.apiKey,
					apiSecret: env.exchange.apiSecret,
				}),
			};
		}

		return {
			assetToAccumulate,
			assetTradeable,
			assetStarting,
			llm,
		};
	});
