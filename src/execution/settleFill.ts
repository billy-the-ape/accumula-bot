import type { PlannedFill } from "@/execution/planTrades.js";
import type { StoredTrade } from "@/schemas/Trade.js";
import type { AppDatabase } from "@/storage/db.js";
import { recordTrade } from "@/storage/repositories/tradeRepository.js";

export async function settleFill(
	db: AppDatabase,
	portfolioId: number,
	fill: PlannedFill,
	cashSymbol: string,
	decisionId?: number,
	options?: { txHash?: string },
): Promise<StoredTrade[]> {
	const quoteValueUsd = fill.quantity * fill.priceUsd;
	const txHash = options?.txHash;
	const tradeInput = {
		portfolioId,
		...(decisionId !== undefined ? { decisionId } : {}),
		...(txHash !== undefined ? { txHash } : {}),
	};

	if (fill.symbol === cashSymbol) {
		return [
			await recordTrade(db, {
				...tradeInput,
				side: fill.side,
				symbol: cashSymbol,
				quantity: quoteValueUsd,
				priceUsd: 1,
				quoteValueUsd,
			}),
		];
	}

	if (fill.side === "sell") {
		const assetTrade = await recordTrade(db, {
			...tradeInput,
			side: "sell",
			symbol: fill.symbol,
			quantity: fill.quantity,
			priceUsd: fill.priceUsd,
			quoteValueUsd,
		});
		const cashTrade = await recordTrade(db, {
			...tradeInput,
			side: "buy",
			symbol: cashSymbol,
			quantity: quoteValueUsd,
			priceUsd: 1,
			quoteValueUsd,
		});
		return [assetTrade, cashTrade];
	}

	const cashTrade = await recordTrade(db, {
		...tradeInput,
		side: "sell",
		symbol: cashSymbol,
		quantity: quoteValueUsd,
		priceUsd: 1,
		quoteValueUsd,
	});
	const assetTrade = await recordTrade(db, {
		...tradeInput,
		side: "buy",
		symbol: fill.symbol,
		quantity: fill.quantity,
		priceUsd: fill.priceUsd,
		quoteValueUsd,
	});
	return [cashTrade, assetTrade];
}
