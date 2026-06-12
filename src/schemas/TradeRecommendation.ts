import z from "zod";

export const AssetRankingSchema = z.object({
	asset: z.string(),
	score: z.number().min(0).max(1),
});

export const TradeRecommendationSchema = z.object({
	rankings: z.array(AssetRankingSchema).min(1),
	recommended_asset: z.string(),
	confidence: z.number().min(0).max(1),
	reason: z.string().min(1),
});

export type AssetRanking = z.infer<typeof AssetRankingSchema>;
export type TradeRecommendation = z.infer<typeof TradeRecommendationSchema>;

export type TradeRecommendationValidation = {
	rankingAssets: string[];
	recommendedAssets: string[];
};

export function createTradeRecommendationSchema(
	validation: TradeRecommendationValidation,
) {
	const rankingAllowed = new Set(validation.rankingAssets);
	const recommendedAllowed = new Set(validation.recommendedAssets);

	return TradeRecommendationSchema.superRefine((data, ctx) => {
		for (const [index, ranking] of data.rankings.entries()) {
			if (!rankingAllowed.has(ranking.asset)) {
				ctx.addIssue({
					code: "custom",
					path: ["rankings", index, "asset"],
					message: `Unknown asset in rankings: ${ranking.asset}. Rankings must use volatile assets only: ${validation.rankingAssets.join(", ")}`,
				});
			}
		}

		if (!recommendedAllowed.has(data.recommended_asset)) {
			ctx.addIssue({
				code: "custom",
				path: ["recommended_asset"],
				message: `recommended_asset must be one of: ${validation.recommendedAssets.join(", ")}`,
			});
		}
	});
}
