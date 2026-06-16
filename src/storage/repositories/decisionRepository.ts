import { desc, eq } from "drizzle-orm";
import z from "zod";
import type { AnalysisContext } from "@/analysis/types.js";
import type { AssetMarketSnapshot } from "@/llm/marketSnapshot.js";
import { MarketSnapshotListSchema } from "@/schemas/MarketSnapshot.js";
import {
	AssetOutlookSchema,
	type TradeRecommendation,
	TradeRecommendationSchema,
} from "@/schemas/TradeRecommendation.js";
import type { AppDatabase } from "@/storage/db.js";
import { type DecisionRow, decisions } from "@/storage/schema.js";

const StoredOutlooksSchema = z.array(AssetOutlookSchema);

const AnalysisContextSchema = z.object({
	fetchedAt: z.string(),
	sections: z.array(
		z.object({
			sourceId: z.string(),
			label: z.string(),
			promptText: z.string(),
			payload: z.unknown(),
		}),
	),
});

export type SaveDecisionInput = {
	assetToAccumulate: string;
	recommendation: TradeRecommendation;
	marketSnapshots: AssetMarketSnapshot[];
	analysisContext?: AnalysisContext;
	llm: {
		provider: string;
		model: string;
		thinking?: string;
	};
};

export type StoredDecision = {
	id: number;
	createdAt: Date;
	assetToAccumulate: string;
	recommendation: TradeRecommendation;
	marketSnapshots: AssetMarketSnapshot[];
	analysisContext?: AnalysisContext;
	llm: {
		provider: string;
		model: string;
		thinking?: string;
	};
};

function resolveDecisionReason(recommendation: TradeRecommendation): string {
	const summary = recommendation.summary?.trim();
	if (summary) {
		return summary;
	}

	const fromOutlooks = recommendation.outlooks
		.map((outlook) => outlook.reason?.trim())
		.filter((reason): reason is string => Boolean(reason))
		.join(" | ");
	if (fromOutlooks) {
		return fromOutlooks;
	}

	return "No summary provided by model.";
}

function mapRowToStoredDecision(row: DecisionRow): StoredDecision {
	const outlooks = StoredOutlooksSchema.parse(JSON.parse(row.rankingsJson));
	const marketSnapshots = MarketSnapshotListSchema.parse(
		JSON.parse(row.marketSnapshotsJson),
	);
	const storedSummary = row.reason.trim() || undefined;
	const recommendation = TradeRecommendationSchema.parse({
		outlooks,
		...(storedSummary ? { summary: storedSummary } : {}),
	});
	const analysisContext = row.analysisContextJson
		? AnalysisContextSchema.parse(JSON.parse(row.analysisContextJson))
		: undefined;

	return {
		id: row.id,
		createdAt: row.createdAt,
		assetToAccumulate: row.assetToAccumulate,
		recommendation,
		marketSnapshots,
		...(analysisContext ? { analysisContext } : {}),
		llm: {
			provider: row.llmProvider,
			model: row.llmModel,
			...(row.llmThinkingText ? { thinking: row.llmThinkingText } : {}),
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
			recommendedAsset: input.recommendation.outlooks
				.map((outlook) => outlook.asset)
				.join(","),
			confidence:
				input.recommendation.outlooks.reduce(
					(total, outlook) => total + outlook.confidence,
					0,
				) / input.recommendation.outlooks.length,
			reason: resolveDecisionReason(input.recommendation),
			rankingsJson: JSON.stringify(input.recommendation.outlooks),
			analysisContextJson: input.analysisContext
				? JSON.stringify(input.analysisContext)
				: null,
			marketSnapshotsJson: JSON.stringify(input.marketSnapshots),
			llmProvider: input.llm.provider,
			llmModel: input.llm.model,
			llmThinkingText: input.llm.thinking ?? null,
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
