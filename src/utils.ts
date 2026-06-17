export const sleep = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));
export const noop = () => {};

export const DAY_MS = 24 * 60 * 60 * 1000;

export const formatDuration = (ms: number) => {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	if (ms < 60000) {
		return `${Math.floor(ms / 10000) * 10}s`;
	}
	if (ms < 3600000) {
		return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
	}
	return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
};
