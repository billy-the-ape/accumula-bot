export const sleep = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));
export const noop = () => {};

export const DAY_MS = 24 * 60 * 60 * 1000;
