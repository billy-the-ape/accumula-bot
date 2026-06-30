import { DEFAULT_PAPER_STARTING_CASH_USD } from "@/execution/paperExecution.js";

export type ParseStartingValueResult =
	| { ok: true; valueUsd: number }
	| { ok: false; error: string };

export function parseStartingValueInput(
	text: string,
): ParseStartingValueResult {
	const trimmed = text.trim();

	if (trimmed === "/default" || trimmed.toLowerCase() === "default") {
		return { ok: true, valueUsd: DEFAULT_PAPER_STARTING_CASH_USD };
	}

	const normalized = trimmed.replace(/,/g, "");
	const value = Number(normalized);

	if (!Number.isFinite(value) || value <= 0) {
		return {
			ok: false,
			error:
				"Please send a positive dollar amount (e.g. 10000) or /default for $10,000.",
		};
	}

	return { ok: true, valueUsd: value };
}
