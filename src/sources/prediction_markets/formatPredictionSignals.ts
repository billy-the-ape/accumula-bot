import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";
import type { PredictionSignal } from "@/schemas/PredictionSignal.js";

function roundHours(value: number): number {
	return Math.round(value * 10) / 10;
}

function formatSignalLine(signal: PredictionSignal): string {
	return [
		`  ${signal.source}:`,
		`implied_up_probability=${signal.impliedUpProbability}`,
		`horizon_hours=${roundHours(signal.horizonHours)}`,
		`liquidity_usd=${Math.round(signal.liquidityUsd)}`,
		`(ref ${signal.marketRef})`,
	].join(" ");
}

/**
 * Render prediction-market signals as a compact, normalized context block (not
 * a verdict). One section per requested asset; assets with no signal are shown
 * explicitly so the model never mistakes absence for a reading.
 */
export function formatPredictionSignals(
	signals: readonly PredictionSignal[],
	assets: readonly Cryptocurrency[],
): string {
	if (assets.length === 0) {
		return "No prediction-market signals available for the requested assets.";
	}

	return assets
		.map((asset) => {
			const assetSignals = signals.filter(
				(signal) => signal.asset === asset.symbol,
			);

			if (assetSignals.length === 0) {
				return `${asset.symbol}:\n  no prediction-market signal available`;
			}

			return [`${asset.symbol}:`, ...assetSignals.map(formatSignalLine)].join(
				"\n",
			);
		})
		.join("\n\n");
}
