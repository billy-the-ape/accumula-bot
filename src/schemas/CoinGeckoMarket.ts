import z from "zod";

export const CoinGeckoMarketSchema = z.object({
	id: z.string(),
	symbol: z.string(),
	current_price: z.number(),
	market_cap: z.number(),
	total_volume: z.number(),
	price_change_percentage_24h_in_currency: z.number().nullable(),
	price_change_percentage_7d_in_currency: z.number().nullable(),
	price_change_percentage_30d_in_currency: z.number().nullable(),
});

export const CoinGeckoMarketListSchema = z.array(CoinGeckoMarketSchema);

export const CoinGeckoMarketChartSchema = z.object({
	total_volumes: z.array(z.tuple([z.number(), z.number()])),
});

export type CoinGeckoMarket = z.infer<typeof CoinGeckoMarketSchema>;
