import { desc, eq } from "drizzle-orm";
import type { PortfolioHoldings } from "@/domain/types.js";
import type { AppDatabase } from "@/storage/db.js";
import {
	type PortfolioRow,
	type PositionRow,
	portfolios,
	positions,
} from "@/storage/schema.js";

export type CreatePortfolioInput = {
	assetToAccumulate: string;
	cashSymbol: string;
	initialHoldings: PortfolioHoldings;
	initialBtcBaseline: number;
	tradingEnabled?: boolean;
};

export type StoredPortfolio = {
	id: number;
	createdAt: Date;
	updatedAt: Date;
	assetToAccumulate: string;
	cashSymbol: string;
	holdings: PortfolioHoldings;
	dailyBaselineBtcValue: number;
	weeklyBaselineBtcValue: number;
	initialBtcBaseline: number;
	tradingEnabled: boolean;
};

export type PortfolioBaselines = {
	dailyBaselineBtcValue: number;
	weeklyBaselineBtcValue: number;
};

function mapPositionsToHoldings(
	positionRows: PositionRow[],
): PortfolioHoldings {
	const holdings: Record<string, number> = {};
	for (const row of positionRows) {
		if (row.quantity > 0) {
			holdings[row.symbol] = row.quantity;
		}
	}
	return holdings;
}

function mapPortfolioRow(
	row: PortfolioRow,
	positionRows: PositionRow[],
): StoredPortfolio {
	return {
		id: row.id,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		assetToAccumulate: row.assetToAccumulate,
		cashSymbol: row.cashSymbol,
		holdings: mapPositionsToHoldings(positionRows),
		dailyBaselineBtcValue: row.dailyBaselineBtcValue,
		weeklyBaselineBtcValue: row.weeklyBaselineBtcValue,
		initialBtcBaseline: row.initialBtcBaseline,
		tradingEnabled: row.tradingEnabled,
	};
}

async function loadPortfolio(
	db: AppDatabase,
	row: PortfolioRow,
): Promise<StoredPortfolio> {
	const positionRows = await db
		.select()
		.from(positions)
		.where(eq(positions.portfolioId, row.id));

	return mapPortfolioRow(row, positionRows);
}

export async function findPortfolioById(
	db: AppDatabase,
	id: number,
): Promise<StoredPortfolio | undefined> {
	const row = await db
		.select()
		.from(portfolios)
		.where(eq(portfolios.id, id))
		.get();
	return row ? loadPortfolio(db, row) : undefined;
}

export async function getLatestPortfolio(
	db: AppDatabase,
): Promise<StoredPortfolio | undefined> {
	const row = await db
		.select()
		.from(portfolios)
		.orderBy(desc(portfolios.createdAt), desc(portfolios.id))
		.limit(1)
		.get();

	return row ? loadPortfolio(db, row) : undefined;
}

export async function createPortfolio(
	db: AppDatabase,
	input: CreatePortfolioInput,
): Promise<StoredPortfolio> {
	const now = new Date();
	const baseline = input.initialBtcBaseline;

	const [row] = await db
		.insert(portfolios)
		.values({
			createdAt: now,
			updatedAt: now,
			assetToAccumulate: input.assetToAccumulate,
			cashSymbol: input.cashSymbol,
			dailyBaselineBtcValue: baseline,
			weeklyBaselineBtcValue: baseline,
			initialBtcBaseline: baseline,
			tradingEnabled: input.tradingEnabled ?? true,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create portfolio");
	}

	for (const [symbol, quantity] of Object.entries(input.initialHoldings)) {
		if (quantity <= 0) {
			continue;
		}

		await db.insert(positions).values({
			portfolioId: row.id,
			symbol,
			quantity,
			updatedAt: now,
		});
	}

	return loadPortfolio(db, row);
}

export async function getOrCreatePortfolio(
	db: AppDatabase,
	input: CreatePortfolioInput,
): Promise<StoredPortfolio> {
	const existing = await getLatestPortfolio(db);
	if (existing) {
		return existing;
	}

	return createPortfolio(db, input);
}

export async function updatePortfolioBaselines(
	db: AppDatabase,
	portfolioId: number,
	baselines: Partial<PortfolioBaselines>,
): Promise<StoredPortfolio> {
	const patch: {
		updatedAt: Date;
		dailyBaselineBtcValue?: number;
		weeklyBaselineBtcValue?: number;
	} = {
		updatedAt: new Date(),
	};

	if (baselines.dailyBaselineBtcValue !== undefined) {
		patch.dailyBaselineBtcValue = baselines.dailyBaselineBtcValue;
	}
	if (baselines.weeklyBaselineBtcValue !== undefined) {
		patch.weeklyBaselineBtcValue = baselines.weeklyBaselineBtcValue;
	}

	const [row] = await db
		.update(portfolios)
		.set(patch)
		.where(eq(portfolios.id, portfolioId))
		.returning();

	if (!row) {
		throw new Error(`Portfolio ${portfolioId} not found`);
	}

	return loadPortfolio(db, row);
}

export async function setPortfolioTradingEnabled(
	db: AppDatabase,
	portfolioId: number,
	tradingEnabled: boolean,
): Promise<StoredPortfolio> {
	const [row] = await db
		.update(portfolios)
		.set({
			tradingEnabled,
			updatedAt: new Date(),
		})
		.where(eq(portfolios.id, portfolioId))
		.returning();

	if (!row) {
		throw new Error(`Portfolio ${portfolioId} not found`);
	}

	return loadPortfolio(db, row);
}

export async function getPortfolioHoldings(
	db: AppDatabase,
	portfolioId: number,
): Promise<PortfolioHoldings> {
	const positionRows = await db
		.select()
		.from(positions)
		.where(eq(positions.portfolioId, portfolioId));

	return mapPositionsToHoldings(positionRows);
}
