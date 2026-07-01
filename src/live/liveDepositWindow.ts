export const LIVE_DEPOSIT_WINDOW_MS = 30 * 60 * 1000;
export const LIVE_DEPOSIT_POLL_INTERVAL_MS = 30_000;

export function getLiveDepositExpiresAt(createdAt: Date): Date {
	return new Date(createdAt.getTime() + LIVE_DEPOSIT_WINDOW_MS);
}

export function isLiveDepositWindowOpen(
	createdAt: Date,
	now: Date = new Date(),
): boolean {
	return now.getTime() < getLiveDepositExpiresAt(createdAt).getTime();
}

export function liveDepositWindowRemainingMs(
	createdAt: Date,
	now: Date = new Date(),
): number {
	return Math.max(
		0,
		getLiveDepositExpiresAt(createdAt).getTime() - now.getTime(),
	);
}
