import type { SocialMediaSectionPayload } from "@/analysis/socialMediaSectionPayload.js";
import { SocialMediaSectionPayloadSchema } from "@/analysis/socialMediaSectionPayload.js";
import type { AnalysisContext, AnalysisSection } from "@/analysis/types.js";
import type { SocialMediaAnalysis } from "@/schemas/SocialMediaAnalysis.js";
import type { SocialMediaSignal } from "@/schemas/SocialMediaSignal.js";
import { SocialMediaSignalListSchema } from "@/schemas/SocialMediaSignal.js";

function getSocialMediaSection(
	context: AnalysisContext,
): AnalysisSection | undefined {
	return context.sections.find(
		(candidate) => candidate.sourceId === "social_media",
	);
}

function parseSocialMediaSectionPayload(
	payload: unknown,
): SocialMediaSectionPayload | undefined {
	const sectionPayload = SocialMediaSectionPayloadSchema.safeParse(payload);
	if (sectionPayload.success) {
		return sectionPayload.data;
	}

	const legacySignals = SocialMediaSignalListSchema.safeParse(payload);
	if (legacySignals.success) {
		return { signals: legacySignals.data };
	}

	return undefined;
}

/**
 * Read social media signals out of an analysis context. Returns an empty array
 * when the source is disabled/absent or its payload is unusable.
 */
export function getSocialMediaSignalsFromContext(
	context: AnalysisContext,
): SocialMediaSignal[] {
	const section = getSocialMediaSection(context);
	if (!section) {
		return [];
	}

	return parseSocialMediaSectionPayload(section.payload)?.signals ?? [];
}

/**
 * Read Stage 1 social media analysis out of an analysis context. Returns
 * undefined when the source is disabled/absent, Stage 1 failed (fallback path),
 * or the payload is unusable.
 */
export function getSocialMediaAnalysisFromContext(
	context: AnalysisContext,
): SocialMediaAnalysis | undefined {
	const section = getSocialMediaSection(context);
	if (!section) {
		return undefined;
	}

	return parseSocialMediaSectionPayload(section.payload)?.analysis;
}

/**
 * Read the combined social media section payload when present. Useful for callers
 * that need both raw signals and structured analysis in one pass.
 */
export function getSocialMediaSectionFromContext(
	context: AnalysisContext,
): SocialMediaSectionPayload | undefined {
	const section = getSocialMediaSection(context);
	if (!section) {
		return undefined;
	}

	return parseSocialMediaSectionPayload(section.payload);
}
