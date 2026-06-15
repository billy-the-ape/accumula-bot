import type { VolumeTrend } from "@/schemas/MarketSnapshot.js";

export function deriveVolumeTrend(
	volumes: Array<[number, number]>,
): VolumeTrend {
	if (volumes.length < 4) {
		return "flat";
	}

	const midpoint = Math.floor(volumes.length / 2);
	const firstHalf = volumes.slice(0, midpoint).map(([, volume]) => volume);
	const secondHalf = volumes.slice(midpoint).map(([, volume]) => volume);

	const firstAverage = average(firstHalf);
	const secondAverage = average(secondHalf);

	if (firstAverage === 0) {
		return "flat";
	}

	const changePct = ((secondAverage - firstAverage) / firstAverage) * 100;

	if (changePct > 10) {
		return "rising";
	}
	if (changePct < -10) {
		return "falling";
	}

	return "flat";
}

function average(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}

	return values.reduce((sum, value) => sum + value, 0) / values.length;
}
