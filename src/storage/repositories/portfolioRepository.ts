import { and, desc, eq } from "drizzle-orm";
import type { PortfolioHoldings } from "@/domain/types.js";
import type { RiskTolerance } from "@/risk/riskTolerance.js";
import type { AppDatabase } from "@/storage/db.js";
import {
	type PortfolioRow,
	type PositionRow,
	portfolios,
	positions,
	telegramUsers,
} from "@/storage/schema.js";

export type { RiskTolerance } from "@/risk/riskTolerance.js";

export type CreatePortfolioInput = {
	assetToAccumulate: string;
	cashSymbol: string;
	initialHoldings: PortfolioHoldings;
	initialBtcBaseline: number;
	initialQuoteBaseline: number;
	tradingEnabled?: boolean;
	telegramUserId?: number;
	riskTolerance?: RiskTolerance;
	isActive?: boolean;
};

export type CreateUserPortfolioInput = CreatePortfolioInput & {
	telegramUserId: number;
	riskTolerance: RiskTolerance;
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
	initialQuoteBaseline: number;
	tradingEnabled: boolean;
	telegramUserId: number | null;
	riskTolerance: RiskTolerance;
	isActive: boolean;
};

export type ActivePortfolio = StoredPortfolio & {
	telegramChatId: string;
	verbose: boolean;
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
		initialQuoteBaseline: row.initialQuoteBaseline,
		tradingEnabled: row.tradingEnabled,
		telegramUserId: row.telegramUserId ?? null,
		riskTolerance: row.riskTolerance as RiskTolerance,
		isActive: row.isActive,
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
			initialQuoteBaseline: input.initialQuoteBaseline,
			tradingEnabled: input.tradingEnabled ?? true,
			...(input.telegramUserId !== undefined
				? { telegramUserId: input.telegramUserId }
				: {}),
			riskTolerance: input.riskTolerance ?? "medium",
			isActive: input.isActive ?? true,
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

export async function deactivateUserPortfolios(
	db: AppDatabase,
	telegramUserId: number,
): Promise<void> {
	await db
		.update(portfolios)
		.set({
			isActive: false,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(portfolios.telegramUserId, telegramUserId),
				eq(portfolios.isActive, true),
			),
		);
}

export async function createUserPortfolio(
	db: AppDatabase,
	input: CreateUserPortfolioInput,
): Promise<StoredPortfolio> {
	await deactivateUserPortfolios(db, input.telegramUserId);

	return createPortfolio(db, {
		...input,
		isActive: true,
	});
}

export async function getActivePortfolioForUser(
	db: AppDatabase,
	telegramUserId: number,
): Promise<StoredPortfolio | undefined> {
	const row = await db
		.select()
		.from(portfolios)
		.where(
			and(
				eq(portfolios.telegramUserId, telegramUserId),
				eq(portfolios.isActive, true),
			),
		)
		.orderBy(desc(portfolios.createdAt), desc(portfolios.id))
		.limit(1)
		.get();

	return row ? loadPortfolio(db, row) : undefined;
}

export async function listActivePortfolios(
	db: AppDatabase,
): Promise<ActivePortfolio[]> {
	const rows = await db
		.select({
			portfolio: portfolios,
			telegramChatId: telegramUsers.telegramChatId,
			verbose: telegramUsers.verbose,
		})
		.from(portfolios)
		.innerJoin(telegramUsers, eq(portfolios.telegramUserId, telegramUsers.id))
		.where(
			and(eq(portfolios.isActive, true), eq(portfolios.tradingEnabled, true)),
		)
		.orderBy(desc(portfolios.createdAt), desc(portfolios.id));

	const results: ActivePortfolio[] = [];
	for (const { portfolio: row, telegramChatId, verbose } of rows) {
		const portfolio = await loadPortfolio(db, row);
		results.push({
			...portfolio,
			telegramChatId,
			verbose,
		});
	}

	return results;
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
