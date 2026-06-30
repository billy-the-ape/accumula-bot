export type ParseStartingValueResult =
	| { ok: true; valueUsd: number }
	| { ok: false; error: string };

export function parseStartingValueInput(
	text: string,
): ParseStartingValueResult {
	const trimmed = text.trim();
	const normalized = trimmed.replace(/,/g, "");
	const value = Number(normalized);

	if (!Number.isFinite(value) || value <= 0) {
		return {
			ok: false,
			error:
				"Please send a positive dollar amount (e.g. 10000) or tap Default.",
		};
	}

	return { ok: true, valueUsd: value };
}
