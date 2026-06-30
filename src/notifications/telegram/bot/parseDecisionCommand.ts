export type ParseDecisionCommandResult =
	| { kind: "last" }
	| { kind: "id"; id: number }
	| { kind: "error"; message: string };

export function parseDecisionCommandArgs(
	args: string | undefined,
): ParseDecisionCommandResult {
	const trimmed = args?.trim();
	if (!trimmed || trimmed.toLowerCase() === "last") {
		return { kind: "last" };
	}

	const id = Number.parseInt(trimmed, 10);
	if (!Number.isInteger(id) || id <= 0) {
		return {
			kind: "error",
			message: "Usage: /decision last or /decision <id>",
		};
	}

	return { kind: "id", id };
}
