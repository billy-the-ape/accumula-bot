import { getCryptocurrency, normalizeRegistrySymbol } from "@/config/assets.js";
import type { PortfolioHoldings, PriceMap } from "@/domain/types.js";
import type { MacroRiskCategory } from "@/schemas/AssetTaxonomy.js";

export type CategoryExposure = Record<MacroRiskCategory, number>;

export type CategoryExposureReport = {
	totalUsd: number;
	exposure: CategoryExposure;
};

const EMPTY_EXPOSURE: CategoryExposure = {
	risk_off: 0,
	neutral: 0,
	risk_on: 0,
};

function resolveAssetCategory(symbol: string): MacroRiskCategory | null {
	const normalized = normalizeRegistrySymbol(symbol);
	if (!normalized) {
		return null;
	}
	return getCryptocurrency(normalized).macroRiskCategory;
}

export function computeCategoryExposure(
	holdings: PortfolioHoldings,
	prices: PriceMap,
): CategoryExposureReport {
	const exposure: CategoryExposure = { ...EMPTY_EXPOSURE };
	let categorizedUsd = 0;

	for (const [symbol, quantity] of Object.entries(holdings)) {
		if (quantity <= 0) {
			continue;
		}
		const category = resolveAssetCategory(symbol);
		if (!category) {
			continue;
		}
		const price = prices[symbol];
		if (price === undefined) {
			continue;
		}
		const positionUsd = quantity * price;
		categorizedUsd += positionUsd;
		exposure[category] += positionUsd;
	}

	if (categorizedUsd <= 0) {
		return { totalUsd: 0, exposure: { ...EMPTY_EXPOSURE } };
	}

	for (const category of Object.keys(exposure) as MacroRiskCategory[]) {
		exposure[category] /= categorizedUsd;
	}

	return { totalUsd: categorizedUsd, exposure };
}

/** Log-only guardrail stub — Phase 1 does not block trades on category limits. */
export function logCategoryExposure(
	portfolioId: number,
	report: CategoryExposureReport,
): void {
	const { exposure, totalUsd } = report;
	console.info(
		`Portfolio ${portfolioId} macro category exposure (USD ${totalUsd.toFixed(2)}): ` +
			`risk_off=${(exposure.risk_off * 100).toFixed(1)}% ` +
			`neutral=${(exposure.neutral * 100).toFixed(1)}% ` +
			`risk_on=${(exposure.risk_on * 100).toFixed(1)}%`,
	);
}

export function summarizeCategoryExposure(
	report: CategoryExposureReport,
): string {
	const { exposure } = report;
	return (
		`risk_off ${(exposure.risk_off * 100).toFixed(1)}%, ` +
		`neutral ${(exposure.neutral * 100).toFixed(1)}%, ` +
		`risk_on ${(exposure.risk_on * 100).toFixed(1)}%`
	);
}
