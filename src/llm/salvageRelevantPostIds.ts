import { extractJsonText } from "@/llm/parseResponse.js";
import type { SocialMediaRelevanceBatchValidation } from "@/schemas/SocialMediaRelevanceBatch.js";

function readRelevantPostIds(parsed: unknown): number[] | undefined {
	if (!parsed || typeof parsed !== "object") {
		return undefined;
	}

	const candidate = (parsed as { relevant_post_ids?: unknown })
		.relevant_post_ids;
	if (!Array.isArray(candidate)) {
		return undefined;
	}

	return candidate.filter(
		(value): value is number =>
			typeof value === "number" && Number.isInteger(value),
	);
}

/** Keep only valid batch-local post_ids when the model mixed in hallucinated values. */
export function salvageRelevantPostIds(
	raw: string,
	validation: SocialMediaRelevanceBatchValidation,
): number[] | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(extractJsonText(raw));
	} catch {
		return null;
	}

	const submittedIds = readRelevantPostIds(parsed);
	if (submittedIds === undefined) {
		return null;
	}

	const allowedPostIds = new Set(
		validation.promptSignals.map((signal) => signal.index),
	);
	const salvagedIds: number[] = [];
	const seenIds = new Set<number>();
	let droppedUnknownCount = 0;

	for (const postId of submittedIds) {
		if (!allowedPostIds.has(postId)) {
			droppedUnknownCount += 1;
			continue;
		}

		if (seenIds.has(postId)) {
			continue;
		}

		salvagedIds.push(postId);
		seenIds.add(postId);
	}

	if (droppedUnknownCount === 0) {
		return null;
	}

	return salvagedIds;
}
