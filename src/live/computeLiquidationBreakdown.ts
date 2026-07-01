export type LiquidationBreakdown = {
	costBasisUsd: number;
	grossUsdc: number;
	profitUsd: number;
	feeUsd: number;
	netToUserUsd: number;
};

export function computeLiquidationBreakdown(params: {
	totalDepositedUsd: number;
	totalWithdrawnUsd: number;
	grossUsdc: number;
	profitFeeBps: number;
}): LiquidationBreakdown {
	const costBasisUsd = Math.max(
		0,
		params.totalDepositedUsd - params.totalWithdrawnUsd,
	);
	const profitUsd = Math.max(0, params.grossUsdc - costBasisUsd);
	const feeUsd = (profitUsd * params.profitFeeBps) / 10_000;
	const netToUserUsd = Math.max(0, params.grossUsdc - feeUsd);

	return {
		costBasisUsd,
		grossUsdc: params.grossUsdc,
		profitUsd,
		feeUsd,
		netToUserUsd,
	};
}
