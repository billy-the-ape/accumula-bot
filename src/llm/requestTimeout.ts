import { Agent } from "undici";

/** Node's fetch (undici) defaults to 5 minutes; local models can exceed that. */
export const DEFAULT_LLM_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

export function createFetchWithTimeout(timeoutMs: number): typeof fetch {
	const agent = new Agent({
		headersTimeout: timeoutMs,
		bodyTimeout: timeoutMs,
	});

	return ((input, init) =>
		fetch(input, {
			...init,
			// undici Agent types differ slightly from @types/node fetch dispatcher types.
			dispatcher: agent as never,
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
