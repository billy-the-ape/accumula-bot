import z from "zod";

// Kalshi prices and counts are returned as fixed-point decimal *strings*
// (e.g. "0.5600", "10000.00"). YES dollar price equals the implied probability
// because each contract settles at a $1 notional. We coerce to numbers and keep
// only the fields the prediction signal needs (unknown keys are dropped by Zod).
export const KalshiMarketSchema = z.object({
	ticker: z.string().min(1),
	event_ticker: z.string().optional(),
	status: z.string(),
	close_time: z.string(),
	yes_bid_dollars: z.coerce.number(),
	yes_ask_dollars: z.coerce.number(),
	last_price_dollars: z.coerce.number(),
	volume_24h_fp: z.coerce.number(),
	notional_value_dollars: z.coerce.number(),
	yes_sub_title: z.string().optional(),
});

export const KalshiMarketsResponseSchema = z.object({
	markets: z.array(KalshiMarketSchema),
	cursor: z.string().optional(),
});

export type KalshiMarket = z.infer<typeof KalshiMarketSchema>;
export type KalshiMarketsResponse = z.infer<typeof KalshiMarketsResponseSchema>;
