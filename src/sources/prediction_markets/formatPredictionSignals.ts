import type { Cryptocurrency } from "@/schemas/Cryptocurrency.js";
import type { PredictionSignal } from "@/schemas/PredictionSignal.js";

function roundHours(value: number): number {
	return Math.round(value * 10) / 10;
}

export function formatCompactUsd(value: number): string {
	const abs = Math.abs(value);
	if (abs >= 1_000_000) {
		return `$${(value / 1_000_000).toFixed(1)}m`;
	}
	if (abs >= 1_000) {
		return `$${(value / 1_000).toFixed(abs >= 10_000 ? 1 : 2)}k`;
	}
	return `$${value.toFixed(2).replace(/\.00$/, "")}`;
}

/** Human-readable one-liner for Telegram / logs (score, icon, mode vs spot). */
export function formatPredictionSignalDisplay(
	signal: PredictionSignal,
): string {
	const score = signal.impliedUpProbability.toFixed(2);
	const icon = signal.impliedUpProbability >= 0.5 ? "📈" : "📉";
	if (signal.modeStrikeUsd !== undefined && signal.spotUsd !== undefined) {
		return `${score} ${icon} (expects ${formatCompactUsd(signal.modeStrikeUsd)} vs current ${formatCompactUsd(signal.spotUsd)})`;
	}
	return `${score} ${icon}`;
}

function formatSignalLine(signal: PredictionSignal): string {
	const parts = [
		`  ${signal.source}:`,
		`directional_score=${signal.impliedUpProbability}`,
	];
	if (signal.modeStrikeUsd !== undefined) {
		parts.push(`mode_strike_usd=${Math.round(signal.modeStrikeUsd)}`);
	}
	if (signal.spotUsd !== undefined) {
		parts.push(`spot_usd=${Math.round(signal.spotUsd)}`);
	}
	if (signal.modeBucketProbability !== undefined) {
		parts.push(`mode_bucket_probability=${signal.modeBucketProbability}`);
	}
	parts.push(
		`horizon_hours=${roundHours(signal.horizonHours)}`,
		`liquidity_usd=${Math.round(signal.liquidityUsd)}`,
		`(ref ${signal.marketRef})`,
	);
	return parts.join(" ");
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
