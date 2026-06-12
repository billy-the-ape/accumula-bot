import z from "zod";

export const TradeSideSchema = z.enum(["buy", "sell"]);

export type TradeSide = z.infer<typeof TradeSideSchema>;

export const StoredTradeSchema = z.object({
	id: z.number().int().positive(),
	portfolioId: z.number().int().positive(),
	decisionId: z.number().int().positive().optional(),
	createdAt: z.date(),
	side: TradeSideSchema,
	symbol: z.string().min(1),
	quantity: z.number().positive(),
	priceUsd: z.number().positive(),
	quoteValueUsd: z.number().positive(),
});

export type StoredTrade = z.infer<typeof StoredTradeSchema>;
