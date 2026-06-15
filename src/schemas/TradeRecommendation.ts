import z from "zod";

function clampUnitInterval(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function clampDirectionScore(value: number): number {
	return Math.min(10, Math.max(1, Math.round(value)));
}

export const AssetOutlookSchema = z.object({
	asset: z.string(),
	direction_score: z.number().transform(clampDirectionScore),
	confidence: z.number().transform(clampUnitInterval),
	reason: z.string().min(1).optional(),
});

export const TradeRecommendationSchema = z.object({
	outlooks: z.array(AssetOutlookSchema).min(1),
	summary: z.string().min(1).optional(),
});

export type AssetOutlook = z.infer<typeof AssetOutlookSchema>;
export type TradeRecommendation = z.infer<typeof TradeRecommendationSchema>;

export type TradeRecommendationValidation = {
	outlookAssets: string[];
};

export function createTradeRecommendationSchema(
	validation: TradeRecommendationValidation,
) {
	const allowedAssets = new Set(validation.outlookAssets);

	return TradeRecommendationSchema.superRefine((data, ctx) => {
		const seenAssets = new Set<string>();

		for (const [index, outlook] of data.outlooks.entries()) {
			if (!allowedAssets.has(outlook.asset)) {
				ctx.addIssue({
					code: "custom",
					path: ["outlooks", index, "asset"],
					message: `Unknown asset in outlooks: ${outlook.asset}. Outlooks must use volatile assets only: ${validation.outlookAssets.join(", ")}`,
				});
			}

			if (seenAssets.has(outlook.asset)) {
				ctx.addIssue({
					code: "custom",
					path: ["outlooks", index, "asset"],
					message: `Duplicate outlook for asset: ${outlook.asset}`,
				});
			}

			seenAssets.add(outlook.asset);
		}

		for (const asset of validation.outlookAssets) {
			if (!seenAssets.has(asset)) {
				ctx.addIssue({
					code: "custom",
					path: ["outlooks"],
					message: `Missing outlook for asset: ${asset}`,
				});
			}
		}
	});
}

export function summarizeRecommendation(recommendation: TradeRecommendation): {
	headline: string;
	averageConfidence: number;
} {
	const actionableOutlooks = recommendation.outlooks.filter(
		(outlook) => outlook.direction_score >= 7 || outlook.direction_score <= 3,
	);
	const averageConfidence =
		recommendation.outlooks.reduce(
			(total, outlook) => total + outlook.confidence,
			0,
		) / recommendation.outlooks.length;

	if (actionableOutlooks.length === 0) {
		return {
			headline: "HOLD",
			averageConfidence,
		};
	}

	const headline = actionableOutlooks
		.map((outlook) => {
			const action =
				outlook.direction_score >= 7
					? "BUY"
					: outlook.direction_score <= 3
						? "SELL"
						: "HOLD";
			return `${outlook.asset}:${action}`;
		})
		.join(",");

	return {
		headline,
		averageConfidence,
	};
}
