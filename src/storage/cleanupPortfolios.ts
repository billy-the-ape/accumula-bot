import { count, inArray, isNull } from "drizzle-orm";
import type { AppDatabase } from "@/storage/db.js";
import {
	portfolios,
	positions,
	telegramUsers,
	trades,
} from "@/storage/schema.js";

export type PortfolioCleanupScope = "legacy" | "all";

export type PortfolioCleanupCounts = {
	scope: PortfolioCleanupScope;
	portfolioIds: number[];
	trades: number;
	positions: number;
	portfolios: number;
	telegramUsers: number;
};

async function getPortfolioIdsForScope(
	db: AppDatabase,
	scope: PortfolioCleanupScope,
): Promise<number[]> {
	if (scope === "all") {
		const rows = await db.select({ id: portfolios.id }).from(portfolios);
		return rows.map((row) => row.id);
	}

	const rows = await db
		.select({ id: portfolios.id })
		.from(portfolios)
		.where(isNull(portfolios.telegramUserId));

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

async function countTelegramUsers(db: AppDatabase): Promise<number> {
	const [row] = await db.select({ value: count() }).from(telegramUsers);
	return row?.value ?? 0;
}

export async function previewPortfolioCleanup(
	db: AppDatabase,
	scope: PortfolioCleanupScope,
): Promise<PortfolioCleanupCounts> {
	const portfolioIds = await getPortfolioIdsForScope(db, scope);

	return {
		scope,
		portfolioIds,
		trades: await countTradesForPortfolios(db, portfolioIds),
		positions: await countPositionsForPortfolios(db, portfolioIds),
		portfolios: portfolioIds.length,
		telegramUsers: scope === "all" ? await countTelegramUsers(db) : 0,
	};
}

export async function cleanupPortfolios(
	db: AppDatabase,
	scope: PortfolioCleanupScope,
): Promise<PortfolioCleanupCounts> {
	const preview = await previewPortfolioCleanup(db, scope);

	if (preview.portfolioIds.length === 0) {
		return preview;
	}

	const portfolioIds = preview.portfolioIds;

	await db.delete(trades).where(inArray(trades.portfolioId, portfolioIds));
	await db
		.delete(positions)
		.where(inArray(positions.portfolioId, portfolioIds));
	await db.delete(portfolios).where(inArray(portfolios.id, portfolioIds));

	if (scope === "all") {
		await db.delete(telegramUsers);
	}

	return preview;
}
