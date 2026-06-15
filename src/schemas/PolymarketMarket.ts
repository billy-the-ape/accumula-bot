import z from "zod";

// Gamma encodes array-valued fields (clobTokenIds, outcomePrices, outcomes) as
// JSON strings, e.g. '["111","222"]', but occasionally returns real arrays.
// Accept both; unknown keys are dropped by Zod.
const StringOrStringArray = z.union([z.string(), z.array(z.string())]);

export const PolymarketGammaMarketSchema = z.object({
	id: z.coerce.string().optional(),
	question: z.string().optional(),
	slug: z.string().optional(),
	conditionId: z.string().optional(),
	endDate: z.string().optional(),
	active: z.boolean().optional(),
	closed: z.boolean().optional(),
	enableOrderBook: z.boolean().optional(),
	liquidityNum: z.number().optional(),
	liquidity: z.coerce.number().optional(),
	volumeNum: z.number().optional(),
	clobTokenIds: StringOrStringArray.optional(),
	outcomePrices: StringOrStringArray.optional(),
	outcomes: StringOrStringArray.optional(),
});

export const PolymarketGammaMarketsResponseSchema = z.array(
	PolymarketGammaMarketSchema,
);

export const PolymarketMidpointSchema = z.object({
	mid_price: z.coerce.number(),
});

export type PolymarketGammaMarket = z.infer<typeof PolymarketGammaMarketSchema>;
export type PolymarketMidpoint = z.infer<typeof PolymarketMidpointSchema>;
