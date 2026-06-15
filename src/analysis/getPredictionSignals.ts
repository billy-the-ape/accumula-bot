import type { AnalysisContext } from "@/analysis/types.js";
import {
	type PredictionSignal,
	PredictionSignalListSchema,
} from "@/schemas/PredictionSignal.js";

/**
 * Read the prediction-market signals out of an analysis context. Returns an
 * empty array when the source is disabled/absent or its payload is unusable —
 * prediction signals are optional, so their absence must never throw.
 */
export function getPredictionSignalsFromContext(
	context: AnalysisContext,
): PredictionSignal[] {
	const section = context.sections.find(
		(candidate) => candidate.sourceId === "prediction_markets",
	);
	if (!section) {
		return [];
	}

	const parsed = PredictionSignalListSchema.safeParse(section.payload);
	return parsed.success ? parsed.data : [];
}
