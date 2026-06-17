import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";

/** Batch-local post_id values shown to the relevance LLM (0 .. n-1). */
export function createBatchLocalPostIdValidation(
	batchSize: number,
): Array<{ index: number }> {
	return Array.from({ length: batchSize }, (_, index) => ({ index }));
}

export function mapBatchLocalPostIdsToGlobal(
	localIds: readonly number[],
	batchSignals: readonly SocialMediaSignal[],
): number[] {
	const globalIds: number[] = [];
	const seenGlobalIds = new Set<number>();

	for (const localId of localIds) {
		if (
			!Number.isInteger(localId) ||
			localId < 0 ||
			localId >= batchSignals.length
		) {
			continue;
		}

		const globalId = batchSignals[localId]?.index;
		if (globalId === undefined || seenGlobalIds.has(globalId)) {
			continue;
		}

		globalIds.push(globalId);
		seenGlobalIds.add(globalId);
	}

	return globalIds;
}

export function buildAllowedPostIdList(batchSize: number): string {
	if (batchSize === 0) {
		return "[]";
	}

	return `[${Array.from({ length: batchSize }, (_, index) => index).join(", ")}]`;
}
