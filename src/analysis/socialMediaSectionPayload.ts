import z from "zod";
import { SocialMediaAnalysisSchema } from "@/schemas/SocialMediaAnalysis.js";
import { SocialMediaSignalListSchema } from "@/schemas/SocialMediaSignal.js";

export const SocialMediaSectionPayloadSchema = z.object({
	signals: SocialMediaSignalListSchema,
	analysis: SocialMediaAnalysisSchema.optional(),
});

export type SocialMediaSectionPayload = z.infer<
	typeof SocialMediaSectionPayloadSchema
>;
