import z from "zod";

export const VolumeTrendSchema = z.enum(["rising", "falling", "flat"]);

export const MarketSnapshotSchema = z.object({
	asset: z.string(),
	priceUsd: z.number(),
	change24hPct: z.number(),
	change7dPct: z.number(),
	change30dPct: z.number(),
	volumeTrend: VolumeTrendSchema,
	marketCapUsd: z.number(),
});

export const MarketSnapshotListSchema = z.array(MarketSnapshotSchema);

export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;
