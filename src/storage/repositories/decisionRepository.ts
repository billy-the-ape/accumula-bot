import { desc, eq } from "drizzle-orm";
import z from "zod";
import type { AssetMarketSnapshot } from "@/llm/marketSnapshot.js";
import { MarketSnapshotListSchema } from "@/schemas/MarketSnapshot.js";
import {
	AssetRankingSchema,
	type TradeRecommendation,
	TradeRecommendationSchema,
} from "@/schemas/TradeRecommendation.js";
import type { AppDatabase } from "@/storage/db.js";
import { type DecisionRow, decisions } from "@/storage/schema.js";

const StoredRankingsSchema = z.array(AssetRankingSchema);

export type SaveDecisionInput = {
	assetToAccumulate: string;
	recommendation: TradeRecommendation;
	marketSnapshots: AssetMarketSnapshot[];
	llm: {
		provider: string;
		model: string;
	};
};

export type StoredDecision = {
	id: number;
	createdAt: Date;
	assetToAccumulate: string;
	recommendation: TradeRecommendation;
	marketSnapshots: AssetMarketSnapshot[];
	llm: {
		provider: string;
		model: string;
	};
};

function mapRowToStoredDecision(row: DecisionRow): StoredDecision {
	const rankings = StoredRankingsSchema.parse(JSON.parse(row.rankingsJson));
	const marketSnapshots = MarketSnapshotListSchema.parse(
		JSON.parse(row.marketSnapshotsJson),
	);
	const recommendation = TradeRecommendationSchema.parse({
		rankings,
		recommended_asset: row.recommendedAsset,
		confidence: row.confidence,
		reason: row.reason,
	});

	return {
		id: row.id,
		createdAt: row.createdAt,
		assetToAccumulate: row.assetToAccumulate,
		recommendation,
		marketSnapshots,
		llm: {
			provider: row.llmProvider,
			model: row.llmModel,
		},
	};
}

export async function saveDecision(
	db: AppDatabase,
	input: SaveDecisionInput,
): Promise<StoredDecision> {
	const [row] = await db
		.insert(decisions)
		.values({
			createdAt: new Date(),
			assetToAccumulate: input.assetToAccumulate,
			recommendedAsset: input.recommendation.recommended_asset,
			confidence: input.recommendation.confidence,
			reason: input.recommendation.reason,
			rankingsJson: JSON.stringify(input.recommendation.rankings),
			marketSnapshotsJson: JSON.stringify(input.marketSnapshots),
			llmProvider: input.llm.provider,
			llmModel: input.llm.model,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to persist decision");
	}

	return mapRowToStoredDecision(row);
}

export async function findDecisionById(
	db: AppDatabase,
	id: number,
): Promise<StoredDecision | undefined> {
	const row = await db
		.select()
		.from(decisions)
		.where(eq(decisions.id, id))
		.get();

	return row ? mapRowToStoredDecision(row) : undefined;
}

export async function listRecentDecisions(
	db: AppDatabase,
	limit = 20,
): Promise<StoredDecision[]> {
	const rows = await db
		.select()
		.from(decisions)
		.orderBy(desc(decisions.createdAt), desc(decisions.id))
		.limit(limit);

	return rows.map(mapRowToStoredDecision);
}
