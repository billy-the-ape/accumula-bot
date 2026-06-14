import { Agent, fetch as undiciFetch } from "undici";

/** Node's fetch (undici) defaults to 5 minutes; local models can exceed that. */
export const DEFAULT_LLM_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

export function createFetchWithTimeout(timeoutMs: number): typeof fetch {
	const agent = new Agent({
		headersTimeout: timeoutMs,
		bodyTimeout: timeoutMs,
	});

	// Node's built-in fetch uses an older undici; Agent must pair with undici's fetch.
	return ((input, init) =>
		undiciFetch(input as Parameters<typeof undiciFetch>[0], {
			...(init as Parameters<typeof undiciFetch>[1]),
			dispatcher: agent,
		})) as typeof fetch;
}

export function formatFetchErrorMessage(error: unknown): string {
	if (!(error instanceof Error)) {
		return "unknown error";
	}

	const cause = error.cause;
	if (cause instanceof Error && cause.message) {
		return `${error.message} (${cause.message})`;
	}

	return error.message;
}
