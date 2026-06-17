import { describe, expect, it } from "vitest";
import {
	buildAllowedPostIdList,
	createBatchLocalPostIdValidation,
	mapBatchLocalPostIdsToGlobal,
} from "@/llm/relevanceBatchPostIds.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";

function makeSignal(index: number): SocialMediaSignal {
	return {
		index,
		id: String(100 + index),
		source: "twitter",
		username: "whale_alert",
		text: "BTC update",
		asOf: "2026-06-16T12:00:00.000Z",
		impressions: 100,
	};
}

describe("relevanceBatchPostIds", () => {
	it("builds a contiguous allowed post_id list", () => {
		expect(buildAllowedPostIdList(3)).toBe("[0, 1, 2]");
		expect(buildAllowedPostIdList(0)).toBe("[]");
	});

	it("creates batch-local validation indices", () => {
		expect(createBatchLocalPostIdValidation(2)).toEqual([
			{ index: 0 },
			{ index: 1 },
		]);
	});

	it("maps batch-local post_ids back to global signal indices", () => {
		const batchSignals = [makeSignal(47), makeSignal(92), makeSignal(103)];

		expect(mapBatchLocalPostIdsToGlobal([0, 2], batchSignals)).toEqual([
			47, 103,
		]);
		expect(mapBatchLocalPostIdsToGlobal([99, 1, 1], batchSignals)).toEqual([
			92,
		]);
	});
});
