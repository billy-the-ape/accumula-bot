import type { AnalysisContext } from "@/analysis/types.js";
import {
	type MarketSnapshot,
	MarketSnapshotListSchema,
} from "@/schemas/MarketSnapshot.js";

export function getMarketSnapshotsFromContext(
	context: AnalysisContext,
): MarketSnapshot[] {
	const section = context.sections.find(
		(candidate) => candidate.sourceId === "market",
	);
	if (!section) {
		throw new Error("Analysis context is missing the market data section");
	}

	return MarketSnapshotListSchema.parse(section.payload);
}
