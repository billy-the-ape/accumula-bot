import z from "zod";

export const StoredWithdrawalSchema = z.object({
	id: z.number().int().positive(),
	portfolioId: z.number().int().positive(),
	destinationAddress: z.string().min(1),
	grossAmountUsd: z.number().nonnegative(),
	feeAmountUsd: z.number().nonnegative(),
	netAmountUsd: z.number().nonnegative(),
	feeTxHash: z.string().min(1).optional(),
	netTxHash: z.string().min(1).optional(),
	createdAt: z.date(),
});

export type StoredWithdrawal = z.infer<typeof StoredWithdrawalSchema>;
