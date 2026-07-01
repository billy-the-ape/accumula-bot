import z from "zod";

export const MacroRiskCategorySchema = z.enum([
	"risk_off",
	"neutral",
	"risk_on",
]);

export type MacroRiskCategory = z.infer<typeof MacroRiskCategorySchema>;

export const AssetClassSchema = z.enum([
	"stablecoin",
	"crypto_major",
	"crypto_alt",
	"yield_bearing",
]);

export type AssetClass = z.infer<typeof AssetClassSchema>;

export const EvmChainMetadataSchema = z.object({
	chainId: z.number().int().positive(),
	contractAddress: z
		.string()
		.regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM contract address"),
	decimals: z.number().int().min(0).max(18),
});

export type EvmChainMetadata = z.infer<typeof EvmChainMetadataSchema>;
