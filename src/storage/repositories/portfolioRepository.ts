import { and, desc, eq, sql } from "drizzle-orm";
import type { PortfolioHoldings } from "@/domain/types.js";
import type { FundingStatus, PortfolioMode } from "@/live/portfolioMode.js";
import type { PortfolioWalletKind } from "@/live/portfolioWalletKind.js";
import { parsePortfolioWalletKind } from "@/live/portfolioWalletKind.js";
import type {
	PortfolioRiskSetting,
	RiskTolerance,
} from "@/risk/riskTolerance.js";
import type { AppDatabase } from "@/storage/db.js";
import {
	type PortfolioRow,
	type PositionRow,
	portfolios,
	positions,
	telegramUsers,
} from "@/storage/schema.js";

export type {
	PortfolioRiskSetting,
	RiskTolerance,
} from "@/risk/riskTolerance.js";

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
	mode?: PortfolioMode;
	chainId?: number;
	walletAddress?: string;
	walletKind?: PortfolioWalletKind;
	encryptedPrivateKey?: string;
	fundingStatus?: FundingStatus;
	totalDepositedUsd?: number;
	minDepositUsd?: number;
};

export type CreateLivePortfolioInput = {
	telegramUserId: number;
	assetToAccumulate: string;
	cashSymbol: string;
	walletAddress: string;
	walletKind?: PortfolioWalletKind;
	encryptedPrivateKey: string;
	chainId: number;
	minDepositUsd: number;
};

export type MarkLivePortfolioFundedInput = {
	portfolioId: number;
	depositUsd: number;
	cashSymbol: string;
	assetToAccumulate: string;
	chainId: number;
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
	riskTolerance: PortfolioRiskSetting;
	isActive: boolean;
	mode: PortfolioMode;
	chainId: number | null;
	walletAddress: string | null;
	walletKind: PortfolioWalletKind;
	fundingStatus: FundingStatus | null;
	totalDepositedUsd: number;
	totalWithdrawnUsd: number;
	minDepositUsd: number | null;
};

import type { TelegramUserSettings } from "@/storage/telegramUserSettings.js";

export type ActivePortfolio = StoredPortfolio & {
	telegramChatId: string;
	verbose: boolean;
	userDateTimeSettings: Pick<TelegramUserSettings, "locale" | "timezone">;
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
		riskTolerance: row.riskTolerance as PortfolioRiskSetting,
		isActive: row.isActive,
		mode: (row.mode ?? "paper") as PortfolioMode,
		chainId: row.chainId ?? null,
		walletAddress: row.walletAddress ?? null,
		walletKind: parsePortfolioWalletKind(row.walletKind),
		fundingStatus: (row.fundingStatus as FundingStatus | null) ?? null,
		totalDepositedUsd: row.totalDepositedUsd ?? 0,
		totalWithdrawnUsd: row.totalWithdrawnUsd ?? 0,
		minDepositUsd: row.minDepositUsd ?? null,
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
			mode: input.mode ?? "paper",
			...(input.chainId !== undefined ? { chainId: input.chainId } : {}),
			...(input.walletAddress !== undefined
				? { walletAddress: input.walletAddress }
				: {}),
			...(input.walletKind !== undefined
				? { walletKind: input.walletKind }
				: {}),
			...(input.encryptedPrivateKey !== undefined
				? { encryptedPrivateKey: input.encryptedPrivateKey }
				: {}),
			...(input.fundingStatus !== undefined
				? { fundingStatus: input.fundingStatus }
				: {}),
			totalDepositedUsd: input.totalDepositedUsd ?? 0,
			...(input.minDepositUsd !== undefined
				? { minDepositUsd: input.minDepositUsd }
				: {}),
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
		mode: "paper",
	});
}

export async function createLivePortfolioAwaitingDeposit(
	db: AppDatabase,
	input: CreateLivePortfolioInput,
): Promise<StoredPortfolio> {
	await deactivateUserPortfolios(db, input.telegramUserId);

	return createPortfolio(db, {
		telegramUserId: input.telegramUserId,
		assetToAccumulate: input.assetToAccumulate,
		cashSymbol: input.cashSymbol,
		initialHoldings: {},
		initialBtcBaseline: 0,
		initialQuoteBaseline: 0,
		tradingEnabled: false,
		riskTolerance: "medium",
		isActive: true,
		mode: "live",
		chainId: input.chainId,
		walletAddress: input.walletAddress,
		walletKind: input.walletKind ?? "eoa",
		encryptedPrivateKey: input.encryptedPrivateKey,
		fundingStatus: "awaiting_deposit",
		minDepositUsd: input.minDepositUsd,
	});
}

export async function revertLivePortfolioAwaitingDeposit(
	db: AppDatabase,
	portfolioId: number,
): Promise<void> {
	const now = new Date();
	await db
		.update(portfolios)
		.set({
			isActive: false,
			updatedAt: now,
		})
		.where(
			and(
				eq(portfolios.id, portfolioId),
				eq(portfolios.mode, "live"),
				eq(portfolios.fundingStatus, "awaiting_deposit"),
			),
		);
}

export type PendingLiveDepositPortfolio = StoredPortfolio & {
	telegramChatId: string;
};

export async function listPendingLiveDepositPortfolios(
	db: AppDatabase,
): Promise<PendingLiveDepositPortfolio[]> {
	const rows = await db
		.select({
			portfolio: portfolios,
			telegramChatId: telegramUsers.telegramChatId,
		})
		.from(portfolios)
		.innerJoin(telegramUsers, eq(portfolios.telegramUserId, telegramUsers.id))
		.where(
			and(
				eq(portfolios.isActive, true),
				eq(portfolios.mode, "live"),
				eq(portfolios.fundingStatus, "awaiting_deposit"),
			),
		);

	return Promise.all(
		rows.map(async ({ portfolio, telegramChatId }) => ({
			...(await loadPortfolio(db, portfolio)),
			telegramChatId,
		})),
	);
}

export async function markLivePortfolioFunded(
	db: AppDatabase,
	input: MarkLivePortfolioFundedInput,
): Promise<StoredPortfolio> {
	const now = new Date();
	const [row] = await db
		.update(portfolios)
		.set({
			fundingStatus: "funded",
			totalDepositedUsd: input.depositUsd,
			initialQuoteBaseline: input.depositUsd,
			updatedAt: now,
		})
		.where(eq(portfolios.id, input.portfolioId))
		.returning();

	if (!row) {
		throw new Error(`Portfolio ${input.portfolioId} not found`);
	}

	await db
		.delete(positions)
		.where(eq(positions.portfolioId, input.portfolioId));
	await db.insert(positions).values({
		portfolioId: input.portfolioId,
		symbol: input.cashSymbol,
		quantity: input.depositUsd,
		updatedAt: now,
	});

	return loadPortfolio(db, row);
}

export async function finalizeLivePortfolioRisk(
	db: AppDatabase,
	portfolioId: number,
	riskTolerance: RiskTolerance,
	initialBtcBaseline: number,
): Promise<StoredPortfolio> {
	const now = new Date();
	const [row] = await db
		.update(portfolios)
		.set({
			riskTolerance,
			tradingEnabled: true,
			dailyBaselineBtcValue: initialBtcBaseline,
			weeklyBaselineBtcValue: initialBtcBaseline,
			initialBtcBaseline,
			updatedAt: now,
		})
		.where(eq(portfolios.id, portfolioId))
		.returning();

	if (!row) {
		throw new Error(`Portfolio ${portfolioId} not found`);
	}

	return loadPortfolio(db, row);
}

export async function updatePortfolioRiskTolerance(
	db: AppDatabase,
	portfolioId: number,
	riskSetting: PortfolioRiskSetting,
): Promise<StoredPortfolio> {
	const [row] = await db
		.update(portfolios)
		.set({
			riskTolerance: riskSetting,
			updatedAt: new Date(),
		})
		.where(eq(portfolios.id, portfolioId))
		.returning();

	if (!row) {
		throw new Error(`Portfolio ${portfolioId} not found`);
	}

	return loadPortfolio(db, row);
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
			locale: telegramUsers.locale,
			timezone: telegramUsers.timezone,
		})
		.from(portfolios)
		.innerJoin(telegramUsers, eq(portfolios.telegramUserId, telegramUsers.id))
		.where(
			and(
				eq(portfolios.isActive, true),
				eq(portfolios.tradingEnabled, true),
				sql`(${portfolios.mode} = 'paper' OR (${portfolios.mode} = 'live' AND ${portfolios.fundingStatus} = 'funded'))`,
			),
		)
		.orderBy(desc(portfolios.createdAt), desc(portfolios.id));

	const results: ActivePortfolio[] = [];
	for (const {
		portfolio: row,
		telegramChatId,
		verbose,
		locale,
		timezone,
	} of rows) {
		const portfolio = await loadPortfolio(db, row);
		results.push({
			...portfolio,
			telegramChatId,
			verbose,
			userDateTimeSettings: { locale, timezone },
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

export async function finalizeLiquidatedPortfolio(
	db: AppDatabase,
	params: {
		portfolioId: number;
		withdrawnUsd: number;
	},
): Promise<void> {
	const now = new Date();
	const portfolio = await findPortfolioById(db, params.portfolioId);
	if (!portfolio) {
		throw new Error(`Portfolio ${params.portfolioId} not found`);
	}

	await db
		.delete(positions)
		.where(eq(positions.portfolioId, params.portfolioId));
	await db
		.update(portfolios)
		.set({
			isActive: false,
			tradingEnabled: false,
			fundingStatus: "paused",
			totalWithdrawnUsd: portfolio.totalWithdrawnUsd + params.withdrawnUsd,
			updatedAt: now,
		})
		.where(eq(portfolios.id, params.portfolioId));
}
