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

// Gamma `/events` groups related markets (e.g. the "Bitcoin above ___ on
// June 16?" threshold ladder). We use the event title to identify the right
// ladder and read its child `markets` for at-the-money selection.
export const PolymarketGammaEventSchema = z.object({
	title: z.string().optional(),
	slug: z.string().optional(),
	closed: z.boolean().optional(),
	markets: z.array(PolymarketGammaMarketSchema).optional(),
});

export const PolymarketGammaEventsResponseSchema = z.array(
	PolymarketGammaEventSchema,
);

export const PolymarketMidpointSchema = z.object({
	mid_price: z.coerce.number(),
});

export type PolymarketGammaMarket = z.infer<typeof PolymarketGammaMarketSchema>;
export type PolymarketGammaEvent = z.infer<typeof PolymarketGammaEventSchema>;
export type PolymarketMidpoint = z.infer<typeof PolymarketMidpointSchema>;
