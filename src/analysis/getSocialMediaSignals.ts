import type { AnalysisContext } from "@/llm";
import {
	type SocialMediaSignal,
	SocialMediaSignalListSchema,
} from "@/schemas/SocialMediaSignal";

export function getSocialMediaSignalsFromContext(
	context: AnalysisContext,
): SocialMediaSignal[] {
	const section = context.sections.find(
		(candidate) => candidate.sourceId === "social_media",
	);
	if (!section) {
		return [];
	}

	const parsed = SocialMediaSignalListSchema.safeParse(section.payload);

	return parsed.success ? parsed.data : [];
}
