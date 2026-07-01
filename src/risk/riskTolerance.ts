import type { OutlookThresholds } from "@/execution/outlookActions.js";

export type RiskTolerance = "low" | "medium" | "high";

/** Preset name or a decimal string between 0 and 1 for custom min confidence. */
export type PortfolioRiskSetting = RiskTolerance | string;

export const MIN_CONFIDENCE_BY_RISK_TOLERANCE: Record<RiskTolerance, number> = {
	low: 0.74,
	medium: 0.67,
	high: 0.6,
};

const PRESET_RISK_TOLERANCES = new Set<string>(["low", "medium", "high"]);

export function isPresetRiskTolerance(
	risk: PortfolioRiskSetting,
): risk is RiskTolerance {
	return PRESET_RISK_TOLERANCES.has(risk);
}

export function parseCustomMinConfidence(raw: string): number | undefined {
	const trimmed = raw.trim();
	if (!/^(\d+(\.\d+)?|\.\d+)$/.test(trimmed)) {
		return undefined;
	}

	const value = Number(trimmed);
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		return undefined;
	}

	return value;
}

export function parsePortfolioRiskInput(
	raw: string,
): PortfolioRiskSetting | undefined {
	const normalized = raw.trim().toLowerCase();
	if (isPresetRiskTolerance(normalized)) {
		return normalized;
	}

	const customValue = parseCustomMinConfidence(raw);
	if (customValue === undefined) {
		return undefined;
	}

	return String(customValue);
}

export function resolveMinConfidence(risk: PortfolioRiskSetting): number {
	if (isPresetRiskTolerance(risk)) {
		return MIN_CONFIDENCE_BY_RISK_TOLERANCE[risk];
	}

	const customValue = parseCustomMinConfidence(risk);
	if (customValue === undefined) {
		return MIN_CONFIDENCE_BY_RISK_TOLERANCE.medium;
	}

	return customValue;
}

export function formatPortfolioRiskLabel(risk: PortfolioRiskSetting): string {
	if (isPresetRiskTolerance(risk)) {
		return risk.charAt(0).toUpperCase() + risk.slice(1);
	}

	return `Custom (${risk})`;
}

export function portfolioRiskMatchesPreset(
	current: PortfolioRiskSetting,
	preset: RiskTolerance,
): boolean {
	return current === preset;
}

export function resolveOutlookThresholds(
	base: OutlookThresholds,
	riskSetting: PortfolioRiskSetting,
): OutlookThresholds {
	return {
		...base,
		minConfidence: resolveMinConfidence(riskSetting),
	};
}
