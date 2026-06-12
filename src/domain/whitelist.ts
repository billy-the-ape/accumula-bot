import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";

export function isStablecoin(asset: Cryptocurrency): boolean {
	return asset.isStable === true;
}

export function filterNonStableAssets(
	assets: readonly Cryptocurrency[],
): Cryptocurrency[] {
	return assets.filter((asset) => !isStablecoin(asset));
}

export function isSymbolTradeable(
	symbol: string,
	tradeable: readonly Cryptocurrency[],
): boolean {
	return tradeable.some((asset) => asset.symbol === symbol);
}
