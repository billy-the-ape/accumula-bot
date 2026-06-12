import z from "zod";

export const CryptocurrencySchema = z.object({
	name: z.string(),
	symbol: z.string(),
	coingeckoId: z.string(),
	exchangeId: z.string(),
});

export type Cryptocurrency = z.infer<typeof CryptocurrencySchema>;
