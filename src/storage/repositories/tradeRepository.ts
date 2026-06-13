import { and, desc, eq, gte } from "drizzle-orm";
import {
	type StoredTrade,
	StoredTradeSchema,
	type TradeSide,
} from "@/schemas/Trade.js";
import type { AppDatabase } from "@/storage/db.js";
import { findPortfolioById } from "@/storage/repositories/portfolioRepository.js";
import {
	portfolios,
	positions,
	type TradeRow,
	trades,
} from "@/storage/schema.js";

type DatabaseExecutor = Pick<
	AppDatabase,
	"select" | "insert" | "update" | "delete"
>;

export type RecordTradeInput = {
	portfolioId: number;
	decisionId?: number;
	side: TradeSide;
	symbol: string;
	quantity: number;
	priceUsd: number;
	quoteValueUsd: number;
};

function mapTradeRow(row: TradeRow): StoredTrade {
	return StoredTradeSchema.parse({
		id: row.id,
		portfolioId: row.portfolioId,
		...(row.decisionId !== null ? { decisionId: row.decisionId } : {}),
		createdAt: row.createdAt,
		side: row.side,
		symbol: row.symbol,
		quantity: row.quantity,
		priceUsd: row.priceUsd,
		quoteValueUsd: row.quoteValueUsd,
	});
}

async function applyPositionChange(
	db: DatabaseExecutor,
	portfolioId: number,
	symbol: string,
	side: TradeSide,
	quantity: number,
	updatedAt: Date,
): Promise<void> {
	const existing = await db
		.select()
		.from(positions)
		.where(
			and(eq(positions.portfolioId, portfolioId), eq(positions.symbol, symbol)),
		)
		.get();

	const currentQuantity = existing?.quantity ?? 0;
	const nextQuantity =
		side === "buy" ? currentQuantity + quantity : currentQuantity - quantity;

	if (nextQuantity < 0) {
		throw new Error(
			`Insufficient ${symbol} balance for sell: have ${currentQuantity}, need ${quantity}`,
		);
	}

	if (nextQuantity === 0) {
		if (existing) {
			await db
				.delete(positions)
				.where(
					and(
						eq(positions.portfolioId, portfolioId),
						eq(positions.symbol, symbol),
					),
				);
		}
		return;
	}

	if (existing) {
		await db
			.update(positions)
			.set({ quantity: nextQuantity, updatedAt })
			.where(
				and(
					eq(positions.portfolioId, portfolioId),
					eq(positions.symbol, symbol),
				),
			);
		return;
	}

	await db.insert(positions).values({
		portfolioId,
		symbol,
		quantity: nextQuantity,
		updatedAt,
	});
}

export async function recordTrade(
	db: AppDatabase,
	input: RecordTradeInput,
): Promise<StoredTrade> {
	const portfolio = await findPortfolioById(db, input.portfolioId);
	if (!portfolio) {
		throw new Error(`Portfolio ${input.portfolioId} not found`);
	}

	const now = new Date();

	const [row] = await db
		.insert(trades)
		.values({
			portfolioId: input.portfolioId,
			...(input.decisionId !== undefined
				? { decisionId: input.decisionId }
				: {}),
			createdAt: now,
			side: input.side,
			symbol: input.symbol,
			quantity: input.quantity,
			priceUsd: input.priceUsd,
			quoteValueUsd: input.quoteValueUsd,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to persist trade");
	}

	await applyPositionChange(
		db,
		input.portfolioId,
		input.symbol,
		input.side,
		input.quantity,
		now,
	);

	await db
		.update(portfolios)
		.set({ updatedAt: now })
		.where(eq(portfolios.id, input.portfolioId));

	return mapTradeRow(row);
}

export async function findTradeById(
	db: AppDatabase,
	id: number,
): Promise<StoredTrade | undefined> {
	const row = await db.select().from(trades).where(eq(trades.id, id)).get();
	return row ? mapTradeRow(row) : undefined;
}

export async function listTradesForPortfolio(
	db: AppDatabase,
	portfolioId: number,
	limit = 50,
): Promise<StoredTrade[]> {
	const rows = await db
		.select()
		.from(trades)
		.where(eq(trades.portfolioId, portfolioId))
		.orderBy(desc(trades.createdAt), desc(trades.id))
		.limit(limit);

	return rows.map(mapTradeRow);
}

export async function listTradesSince(
	db: AppDatabase,
	portfolioId: number,
	since: Date,
): Promise<StoredTrade[]> {
	const rows = await db
		.select()
		.from(trades)
		.where(
			and(eq(trades.portfolioId, portfolioId), gte(trades.createdAt, since)),
		)
		.orderBy(desc(trades.createdAt), desc(trades.id));

	return rows.map(mapTradeRow);
}
