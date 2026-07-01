/** Converts a human-readable token amount to base units (wei). */
export function toTokenUnits(amount: number, decimals: number): bigint {
	if (!Number.isFinite(amount) || amount <= 0) {
		throw new Error(`Invalid token amount: ${amount}`);
	}
	const factor = 10 ** decimals;
	const scaled = Math.round(amount * factor);
	return BigInt(scaled);
}

/** Converts base units to a human-readable token amount. */
export function fromTokenUnits(amount: bigint, decimals: number): number {
	return Number(amount) / 10 ** decimals;
}

/** Truncates a human amount to token decimal precision (avoids float dust). */
export function truncateToTokenDecimals(
	amount: number,
	decimals: number,
): number {
	const factor = 10 ** decimals;
	return Math.floor(amount * factor) / factor;
}
