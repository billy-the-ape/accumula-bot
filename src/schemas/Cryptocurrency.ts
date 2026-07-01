import z from "zod";
import {
	AssetClassSchema,
	EvmChainMetadataSchema,
	MacroRiskCategorySchema,
} from "@/schemas/AssetTaxonomy.js";

export const CryptocurrencySchema = z.object({
	name: z.string(),
	symbol: z.string(),
	coingeckoId: z.string(),
	exchangeId: z.string(),
	macroRiskCategory: MacroRiskCategorySchema,
	assetClass: AssetClassSchema,
	isStable: z.boolean().optional(),
	/** Base (or future chain) contract metadata for live on-chain trading. */
	evm: EvmChainMetadataSchema.optional(),
});

export type Cryptocurrency = z.infer<typeof CryptocurrencySchema>;
