import type { MacroRiskCategory } from "@/schemas/AssetTaxonomy.js";
import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";

const CATEGORY_LABELS: Record<MacroRiskCategory, string> = {
	risk_off: "risk_off (defensive — stables, capital preservation)",
	neutral: "neutral (core / yield — moderate macro sensitivity)",
	risk_on: "risk_on (beta — higher sensitivity to risk-on/risk-off regimes)",
};

const CATEGORY_ORDER: MacroRiskCategory[] = ["risk_off", "neutral", "risk_on"];

function formatAssetEntry(asset: Cryptocurrency): string {
	const classLabel = asset.assetClass.replace("_", " ");
	return `${asset.symbol} (${asset.name}; ${classLabel})`;
}

function groupAssetsByCategory(
	assets: readonly Cryptocurrency[],
): Map<MacroRiskCategory, Cryptocurrency[]> {
	const grouped = new Map<MacroRiskCategory, Cryptocurrency[]>(
		CATEGORY_ORDER.map((category) => [category, []]),
	);

	for (const asset of assets) {
		grouped.get(asset.macroRiskCategory)?.push(asset);
	}

	return grouped;
}

/** Compact taxonomy block for LLM prompts — macro categories guide allocation thinking. */
export function formatAssetTaxonomyForPrompt(
	tradeableAssets: readonly Cryptocurrency[],
): string {
	const grouped = groupAssetsByCategory(tradeableAssets);
	const lines = [
		"Asset taxonomy (macro risk categories — use for rotation and defensive positioning):",
	];

	for (const category of CATEGORY_ORDER) {
		const assets = grouped.get(category) ?? [];
		if (assets.length === 0) {
			continue;
		}
		lines.push(
			`- ${CATEGORY_LABELS[category]}: ${assets.map(formatAssetEntry).join("; ")}`,
		);
	}

	lines.push(
		"In risk-off macro regimes, favor risk_off and neutral assets; in risk-on regimes, risk_on assets may outperform.",
	);

	return lines.join("\n");
}

export function listAssetsInCategory(
	tradeableAssets: readonly Cryptocurrency[],
	category: MacroRiskCategory,
): Cryptocurrency[] {
	return tradeableAssets.filter(
		(asset) => asset.macroRiskCategory === category,
	);
}
