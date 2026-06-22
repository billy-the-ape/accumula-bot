export const sleep = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));
export const noop = () => {};

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;

export const formatDuration = (ms: number) => {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	if (ms < 60000) {
		return `${Math.floor(ms / 10000) * 10}s`;
	}
	if (ms < 3600000) {
		const secs = Math.floor((ms % 60000) / 1000);
		if (secs > 0) {
			return `${Math.floor(ms / 60000)}m ${secs}s`;
		}
		return `${Math.floor(ms / 60000)}m`;
	}

	if (ms < DAY_MS * 2) {
		const mins = Math.floor((ms % 3600000) / 60000);
		if (mins > 0) {
			return `${Math.floor(ms / 3600000)}h ${mins}m`;
		}
		return `${Math.floor(ms / 3600000)}h`;
	}

	const days = Math.floor(ms / DAY_MS);
	if (days > 0) {
		const hours = Math.floor((ms % DAY_MS) / 3600000);
		if (hours > 0) {
			return `${days}d ${hours}h`;
		}
		return `${days}d`;
	}
	return `${Math.floor(ms / DAY_MS)}d`;
};
