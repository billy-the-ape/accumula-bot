import {
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const decisions = sqliteTable("decisions", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	assetToAccumulate: text("asset_to_accumulate").notNull(),
	recommendedAsset: text("recommended_asset").notNull(),
	confidence: real("confidence").notNull(),
	reason: text("reason").notNull(),
	rankingsJson: text("rankings_json").notNull(),
	analysisContextJson: text("analysis_context_json"),
	marketSnapshotsJson: text("market_snapshots_json").notNull(),
	llmProvider: text("llm_provider").notNull(),
	llmModel: text("llm_model").notNull(),
	llmThinkingText: text("llm_thinking_text"),
});

export const portfolios = sqliteTable("portfolios", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	assetToAccumulate: text("asset_to_accumulate").notNull(),
	cashSymbol: text("cash_symbol").notNull(),
	dailyBaselineBtcValue: real("daily_baseline_btc_value").notNull(),
	weeklyBaselineBtcValue: real("weekly_baseline_btc_value").notNull(),
	initialBtcBaseline: real("initial_btc_baseline").notNull(),
	initialQuoteBaseline: real("initial_quote_baseline")
		.notNull()
		.default(10_000),
	tradingEnabled: integer("trading_enabled", { mode: "boolean" })
		.notNull()
		.default(true),
});

export const positions = sqliteTable(
	"positions",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		portfolioId: integer("portfolio_id")
			.notNull()
			.references(() => portfolios.id),
		symbol: text("symbol").notNull(),
		quantity: real("quantity").notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		uniqueIndex("positions_portfolio_symbol_idx").on(
			table.portfolioId,
			table.symbol,
		),
	],
);

export const trades = sqliteTable("trades", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	portfolioId: integer("portfolio_id")
		.notNull()
		.references(() => portfolios.id),
	decisionId: integer("decision_id").references(() => decisions.id),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	side: text("side").notNull(),
	symbol: text("symbol").notNull(),
	quantity: real("quantity").notNull(),
	priceUsd: real("price_usd").notNull(),
	quoteValueUsd: real("quote_value_usd").notNull(),
});

export const macroBriefings = sqliteTable("macro_briefings", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	content: text("content").notNull(),
	llmProvider: text("llm_provider").notNull(),
	llmModel: text("llm_model").notNull(),
	promptVersion: text("prompt_version").notNull(),
});

export type DecisionRow = typeof decisions.$inferSelect;
export type NewDecisionRow = typeof decisions.$inferInsert;
export type PortfolioRow = typeof portfolios.$inferSelect;
export type NewPortfolioRow = typeof portfolios.$inferInsert;
export type PositionRow = typeof positions.$inferSelect;
export type NewPositionRow = typeof positions.$inferInsert;
export type TradeRow = typeof trades.$inferSelect;
export type NewTradeRow = typeof trades.$inferInsert;
export type MacroBriefingRow = typeof macroBriefings.$inferSelect;
export type NewMacroBriefingRow = typeof macroBriefings.$inferInsert;
