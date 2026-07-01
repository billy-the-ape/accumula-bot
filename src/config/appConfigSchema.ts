import z from "zod";
import {
	CRYPTOCURRENCY_REGISTRY,
	type CryptocurrencySymbol,
	normalizeRegistrySymbol,
	resolveCryptocurrencyForChain,
} from "@/config/assets.js";
import { assertSupportedDepositChainId } from "@/config/chainAssets.js";
import type { ParsedEnv } from "@/config/envSchema.js";
import type { OutlookThresholds } from "@/execution/outlookActions.js";
import type { CdpGasPaymentMode } from "@/live/cdpPaymaster.js";
import {
	type Cryptocurrency,
	CryptocurrencySchema,
} from "@/schemas/Cryptocurrency.js";
import type { LlmProviderId } from "@/schemas/LlmProvider.js";

const LlmConfigSchema = z.object({
	provider: z.enum(["ollama", "openai_compatible", "anthropic"]),
	baseUrl: z.url(),
	model: z.string().min(1),
	fastModel: z.string().min(1),
	requestTimeoutMs: z.number().int().positive(),
	temperature: z.number().min(0).max(2),
	contextTokens: z.number().int().min(2048),
	maxOutputTokens: z.number().int().positive(),
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
	fastModel: string;
	requestTimeoutMs: number;
	temperature: number;
	contextTokens: number;
	maxOutputTokens: number;
	apiKey?: string;
};

export type CoinGeckoConfig = {
	baseUrl: string;
	apiKey?: string;
};

export type TelegramConfig = {
	botToken: string;
	chatId?: string;
};

export type TwitterConfig = {
	cloudamqpUrl: string;
	searchString?: string;
	searchMaxPages?: number;
};

export type PredictionMarketScoringConfig = {
	/** Percentage gap from spot (e.g. 0.05 = ±5%) mapped to the [0,1] extremes. */
	normalizationBandPct: number;
	/** Maximum rungs nearest spot used to build the implied distribution. */
	maxRungs: number;
	/** Minimum rungs required to emit a signal (else no signal). */
	minRungs: number;
	/** Liquidity floor (USD) a rung must clear; falls back to all rungs if too few. */
	minRungLiquidityUsd: number;
};

export type PredictionMarketsConfig = {
	enabled: boolean;
	kalshiBaseUrl: string;
	polymarketGammaBaseUrl: string;
	polymarketClobBaseUrl: string;
	targetHorizonHours: number;
	scoring: PredictionMarketScoringConfig;
};

export type SocialMediaConfig = {
	enabled: boolean;
	twitterConfig: TwitterConfig;
};

export type LiveTradingConfig = {
	minDepositUsd: number;
	depositRpcUrl: string;
	depositChainId: number;
	walletEncryptionKey?: string;
	zeroXApiKey?: string;
	maxSlippageBps: number;
	gasBootstrapUsd: number;
	cdpPaymasterRpcUrl?: string;
	cdpGasPolicyId?: string;
	cdpGasPaymentMode: CdpGasPaymentMode;
};

export type RiskGuardrailsConfig = {
	maxRiskOnFraction: number;
};

export type WithdrawalConfig = {
	profitFeeBps: number;
	treasuryAddress?: `0x${string}`;
};

export type AppConfig = {
	socialMedia: SocialMediaConfig;
	assetToAccumulate: Cryptocurrency;
	assetTradeable: Cryptocurrency[];
	assetStarting: Cryptocurrency;
	live: LiveTradingConfig;
	withdrawal: WithdrawalConfig;
	riskGuardrails: RiskGuardrailsConfig;
	databasePath: string;
	coingecko: CoinGeckoConfig;
	llm: LlmConfig;
	exchange?: z.infer<typeof ExchangeConfigSchema>;
	telegram?: TelegramConfig;
	predictionMarkets: PredictionMarketsConfig;
	outlookThresholds: OutlookThresholds;
	verbosePromptLogs: boolean;
};

function listUnknownSymbols(symbols: string[]): string[] {
	return symbols.filter((symbol) => normalizeRegistrySymbol(symbol) === null);
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

		const hasTelegramToken = env.telegram.botToken !== undefined;
		const hasTelegramChatId = env.telegram.chatId !== undefined;

		if (hasTelegramChatId && !hasTelegramToken) {
			ctx.addIssue({
				code: "custom",
				message: "TELEGRAM_CHAT_ID requires TELEGRAM_BOT_TOKEN to be set",
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
		const depositChainId = assertSupportedDepositChainId(env.depositChainId);

		const resolveAsset = (symbol: string): Cryptocurrency =>
			CryptocurrencySchema.parse(
				resolveCryptocurrencyForChain(
					normalizeRegistrySymbol(symbol) as CryptocurrencySymbol,
					depositChainId,
				),
			);

		const assetToAccumulate = resolveAsset(env.assetToAccumulateSymbol);
		const assetTradeable = env.assetTradeableSymbols.map((symbol) =>
			resolveAsset(symbol),
		);
		const assetStarting = resolveAsset(env.assetStartingSymbol);
		const llmPayload = LlmConfigSchema.parse(env.llm);
		const llm: LlmConfig = {
			provider: llmPayload.provider,
			baseUrl: llmPayload.baseUrl,
			model: llmPayload.model,
			fastModel: llmPayload.fastModel,
			requestTimeoutMs: llmPayload.requestTimeoutMs,
			temperature: llmPayload.temperature,
			contextTokens: llmPayload.contextTokens,
			maxOutputTokens: llmPayload.maxOutputTokens,
			...(llmPayload.apiKey ? { apiKey: llmPayload.apiKey } : {}),
		};
		const coingecko: CoinGeckoConfig = {
			baseUrl: env.coingecko.baseUrl,
			...(env.coingecko.apiKey ? { apiKey: env.coingecko.apiKey } : {}),
		};

		const hasApiKey = env.exchange.apiKey !== undefined;
		const hasApiSecret = env.exchange.apiSecret !== undefined;
		const hasTelegramToken = env.telegram.botToken !== undefined;
		const hasTelegramChatId = env.telegram.chatId !== undefined;

		const telegram: TelegramConfig | undefined = hasTelegramToken
			? hasTelegramChatId
				? {
						botToken: env.telegram.botToken as string,
						chatId: env.telegram.chatId as string,
					}
				: {
						botToken: env.telegram.botToken as string,
					}
			: undefined;

		const live: LiveTradingConfig = {
			minDepositUsd: env.liveMinDepositUsd,
			depositRpcUrl: env.depositRpcUrl,
			depositChainId,
			maxSlippageBps: env.liveMaxSlippageBps,
			gasBootstrapUsd: env.liveGasBootstrapUsd,
			...(env.walletEncryptionKey
				? { walletEncryptionKey: env.walletEncryptionKey }
				: {}),
			...(env.zeroXApiKey ? { zeroXApiKey: env.zeroXApiKey } : {}),
			...(env.cdpPaymasterRpcUrl
				? { cdpPaymasterRpcUrl: env.cdpPaymasterRpcUrl }
				: {}),
			...(env.cdpGasPolicyId ? { cdpGasPolicyId: env.cdpGasPolicyId } : {}),
			cdpGasPaymentMode: env.cdpGasPaymentMode,
		};

		return {
			assetToAccumulate,
			assetTradeable,
			assetStarting,
			live,
			withdrawal: {
				profitFeeBps: env.withdrawalProfitFeeBps,
				...(env.withdrawalTreasuryAddress
					? {
							treasuryAddress: env.withdrawalTreasuryAddress as `0x${string}`,
						}
					: {}),
			},
			riskGuardrails: {
				maxRiskOnFraction: env.categoryMaxRiskOnFraction,
			},
			databasePath: env.databasePath,
			coingecko,
			llm,
			outlookThresholds: env.outlookThresholds,
			socialMedia: {
				enabled: env.socialMedia.enabled,
				twitterConfig: {
					cloudamqpUrl: env.socialMedia.twitterConfig.cloudamqpUrl,
					searchString: env.socialMedia.twitterConfig.searchString ?? "",
					searchMaxPages: env.socialMedia.twitterConfig.searchMaxPages || 5,
				},
			},
			predictionMarkets: env.predictionMarkets,
			verbosePromptLogs: env.verbosePromptLogs,
			...(telegram ? { telegram } : {}),
			...(hasApiKey &&
				hasApiSecret && {
					exchange: ExchangeConfigSchema.parse({
						apiKey: env.exchange.apiKey,
						apiSecret: env.exchange.apiSecret,
					}),
				}),
		};
	});
