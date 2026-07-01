import { sql } from "drizzle-orm";
import {
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const telegramUsers = sqliteTable(
	"telegram_users",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		telegramChatId: text("telegram_chat_id").notNull(),
		onboardingState: text("onboarding_state"),
		onboardingDraftJson: text("onboarding_draft_json"),
		verbose: integer("verbose", { mode: "boolean" }).notNull().default(false),
		defaultRiskTolerance: text("default_risk_tolerance")
			.notNull()
			.default("medium"),
		locale: text("locale"),
		timezone: text("timezone"),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		uniqueIndex("telegram_users_chat_id_idx").on(table.telegramChatId),
	],
);

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

export const portfolios = sqliteTable(
	"portfolios",
	{
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
		telegramUserId: integer("telegram_user_id").references(
			() => telegramUsers.id,
		),
		riskTolerance: text("risk_tolerance").notNull().default("medium"),
		isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
		mode: text("mode").notNull().default("paper"),
		chainId: integer("chain_id"),
		walletAddress: text("wallet_address"),
		walletKind: text("wallet_kind").notNull().default("eoa"),
		encryptedPrivateKey: text("encrypted_private_key"),
		fundingStatus: text("funding_status"),
		totalDepositedUsd: real("total_deposited_usd").notNull().default(0),
		totalWithdrawnUsd: real("total_withdrawn_usd").notNull().default(0),
		minDepositUsd: real("min_deposit_usd"),
	},
	(table) => [
		uniqueIndex("portfolios_one_active_per_user_idx")
			.on(table.telegramUserId)
			.where(sql`${table.isActive} = 1`),
	],
);

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
	txHash: text("tx_hash"),
});

export const withdrawals = sqliteTable("withdrawals", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	portfolioId: integer("portfolio_id")
		.notNull()
		.references(() => portfolios.id),
	destinationAddress: text("destination_address").notNull(),
	grossAmountUsd: real("gross_amount_usd").notNull(),
	feeAmountUsd: real("fee_amount_usd").notNull(),
	netAmountUsd: real("net_amount_usd").notNull(),
	feeTxHash: text("fee_tx_hash"),
	netTxHash: text("net_tx_hash"),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const macroBriefings = sqliteTable("macro_briefings", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	content: text("content").notNull(),
	llmProvider: text("llm_provider").notNull(),
	llmModel: text("llm_model").notNull(),
	promptVersion: text("prompt_version").notNull(),
});

export const socialMediaPosts = sqliteTable(
	"social_media_posts",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		externalId: text("external_id").notNull(),
		source: text("source").notNull(),
		username: text("username").notNull(),
		text: text("text").notNull(),
		postedAt: integer("posted_at", { mode: "timestamp_ms" }).notNull(),
		impressions: integer("impressions").notNull().default(0),
		relevanceScore: integer("relevance_score").notNull(),
		scoredAt: integer("scored_at", { mode: "timestamp_ms" }).notNull(),
		llmProvider: text("llm_provider").notNull(),
		llmModel: text("llm_model").notNull(),
	},
	(table) => [
		uniqueIndex("social_media_posts_source_external_id_idx").on(
			table.source,
			table.externalId,
		),
	],
);

export type TelegramUserRow = typeof telegramUsers.$inferSelect;
export type NewTelegramUserRow = typeof telegramUsers.$inferInsert;
export type DecisionRow = typeof decisions.$inferSelect;
export type NewDecisionRow = typeof decisions.$inferInsert;
export type PortfolioRow = typeof portfolios.$inferSelect;
export type NewPortfolioRow = typeof portfolios.$inferInsert;
export type PositionRow = typeof positions.$inferSelect;
export type NewPositionRow = typeof positions.$inferInsert;
export type TradeRow = typeof trades.$inferSelect;
export type NewTradeRow = typeof trades.$inferInsert;
export type WithdrawalRow = typeof withdrawals.$inferSelect;
export type NewWithdrawalRow = typeof withdrawals.$inferInsert;
export type MacroBriefingRow = typeof macroBriefings.$inferSelect;
export type NewMacroBriefingRow = typeof macroBriefings.$inferInsert;
export type SocialMediaPostRow = typeof socialMediaPosts.$inferSelect;
export type NewSocialMediaPostRow = typeof socialMediaPosts.$inferInsert;
