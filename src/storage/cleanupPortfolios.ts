import { count, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/storage/db.js";
import { portfolios, positions, trades } from "@/storage/schema.js";

export type PortfolioCleanupCounts = {
	portfolioIds: number[];
	trades: number;
	positions: number;
	portfolios: number;
};

async function getAllPortfolioIds(db: AppDatabase): Promise<number[]> {
	const rows = await db.select({ id: portfolios.id }).from(portfolios);
	return rows.map((row) => row.id);
}

async function countTradesForPortfolios(
	db: AppDatabase,
	portfolioIds: readonly number[],
): Promise<number> {
	if (portfolioIds.length === 0) {
		return 0;
	}

	const [row] = await db
		.select({ value: count() })
		.from(trades)
		.where(inArray(trades.portfolioId, [...portfolioIds]));

	return row?.value ?? 0;
}

async function countPositionsForPortfolios(
	db: AppDatabase,
	portfolioIds: readonly number[],
): Promise<number> {
	if (portfolioIds.length === 0) {
		return 0;
	}

	const [row] = await db
		.select({ value: count() })
		.from(positions)
		.where(inArray(positions.portfolioId, [...portfolioIds]));

	return row?.value ?? 0;
}

export async function previewPortfolioCleanup(
	db: AppDatabase,
): Promise<PortfolioCleanupCounts> {
	const portfolioIds = await getAllPortfolioIds(db);

	return {
		portfolioIds,
		trades: await countTradesForPortfolios(db, portfolioIds),
		positions: await countPositionsForPortfolios(db, portfolioIds),
		portfolios: portfolioIds.length,
	};
}

export async function cleanupPortfolios(
	db: AppDatabase,
): Promise<PortfolioCleanupCounts> {
	const preview = await previewPortfolioCleanup(db);

	if (preview.portfolioIds.length === 0) {
		return preview;
	}

	const portfolioIds = preview.portfolioIds;

	await db.delete(trades).where(inArray(trades.portfolioId, portfolioIds));
	await db
		.delete(positions)
		.where(inArray(positions.portfolioId, portfolioIds));
	await db.delete(portfolios).where(inArray(portfolios.id, portfolioIds));

	return preview;
}
