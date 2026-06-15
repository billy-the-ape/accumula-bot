import z from "zod";

export const PredictionMarketSourceSchema = z.enum(["polymarket", "kalshi"]);

export const PredictionSignalSchema = z.object({
	asset: z.string().min(1),
	source: PredictionMarketSourceSchema,
	impliedUpProbability: z.number().min(0).max(1),
	horizonHours: z.number().positive(),
	liquidityUsd: z.number().nonnegative(),
	asOf: z
		.string()
		.min(1)
		.refine((value) => !Number.isNaN(Date.parse(value)), {
			message: "asOf must be a parseable date-time string",
		}),
	marketRef: z.string().min(1),
});

export const PredictionSignalListSchema = z.array(PredictionSignalSchema);

export type PredictionMarketSource = z.infer<
	typeof PredictionMarketSourceSchema
>;
export type PredictionSignal = z.infer<typeof PredictionSignalSchema>;
