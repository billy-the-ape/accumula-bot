import type { StoredWithdrawal } from "@/schemas/Withdrawal.js";
import { StoredWithdrawalSchema } from "@/schemas/Withdrawal.js";
import type { AppDatabase } from "@/storage/db.js";
import { type WithdrawalRow, withdrawals } from "@/storage/schema.js";

export type RecordWithdrawalInput = {
	portfolioId: number;
	destinationAddress: string;
	grossAmountUsd: number;
	feeAmountUsd: number;
	netAmountUsd: number;
	feeTxHash?: string;
	netTxHash?: string;
};

function mapWithdrawalRow(row: WithdrawalRow): StoredWithdrawal {
	return StoredWithdrawalSchema.parse({
		id: row.id,
		portfolioId: row.portfolioId,
		destinationAddress: row.destinationAddress,
		grossAmountUsd: row.grossAmountUsd,
		feeAmountUsd: row.feeAmountUsd,
		netAmountUsd: row.netAmountUsd,
		createdAt: row.createdAt,
		...(row.feeTxHash ? { feeTxHash: row.feeTxHash } : {}),
		...(row.netTxHash ? { netTxHash: row.netTxHash } : {}),
	});
}

export async function recordWithdrawal(
	db: AppDatabase,
	input: RecordWithdrawalInput,
): Promise<StoredWithdrawal> {
	const [row] = await db
		.insert(withdrawals)
		.values({
			portfolioId: input.portfolioId,
			destinationAddress: input.destinationAddress,
			grossAmountUsd: input.grossAmountUsd,
			feeAmountUsd: input.feeAmountUsd,
			netAmountUsd: input.netAmountUsd,
			...(input.feeTxHash !== undefined ? { feeTxHash: input.feeTxHash } : {}),
			...(input.netTxHash !== undefined ? { netTxHash: input.netTxHash } : {}),
			createdAt: new Date(),
		})
		.returning();

	if (!row) {
		throw new Error("Failed to persist withdrawal");
	}

	return mapWithdrawalRow(row);
}
