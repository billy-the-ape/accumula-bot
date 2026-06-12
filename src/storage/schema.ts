import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const decisions = sqliteTable("decisions", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	assetToAccumulate: text("asset_to_accumulate").notNull(),
	recommendedAsset: text("recommended_asset").notNull(),
	confidence: real("confidence").notNull(),
	reason: text("reason").notNull(),
	rankingsJson: text("rankings_json").notNull(),
	marketSnapshotsJson: text("market_snapshots_json").notNull(),
	llmProvider: text("llm_provider").notNull(),
	llmModel: text("llm_model").notNull(),
});

export type DecisionRow = typeof decisions.$inferSelect;
export type NewDecisionRow = typeof decisions.$inferInsert;
