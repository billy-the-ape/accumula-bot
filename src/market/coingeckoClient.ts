import { deriveVolumeTrend } from "@/market/volumeTrend.js";
import {
	CoinGeckoMarketChartSchema,
	CoinGeckoMarketListSchema,
} from "@/schemas/CoinGeckoMarket.js";
import type { VolumeTrend } from "@/schemas/MarketSnapshot.js";

export class MarketDataError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MarketDataError";
	}
}

export type CoinGeckoClientOptions = {
	baseUrl: string;
	apiKey?: string;
	fetchImpl?: typeof fetch;
};

function buildHeaders(apiKey?: string): Record<string, string> {
	if (!apiKey) {
		return {};
	}

	return {
		"x-cg-demo-api-key": apiKey,
	};
}

async function fetchJson<T>(
	options: CoinGeckoClientOptions,
	path: string,
	schema: { parse: (value: unknown) => T },
): Promise<T> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const url = new URL(path, `${options.baseUrl}/`);

	let response: Response;
	try {
		response = await fetchImpl(url, {
			headers: buildHeaders(options.apiKey),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown error";
		throw new MarketDataError(
			`Failed to reach CoinGecko at ${url.origin}: ${message}`,
		);
	}

	if (!response.ok) {
		const body = await response.text();
		throw new MarketDataError(
			`CoinGecko request failed (${response.status}): ${body || response.statusText}`,
		);
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw new MarketDataError("CoinGecko returned a non-JSON response body");
	}

	try {
		return schema.parse(payload);
	} catch (error) {
		const message = error instanceof Error ? error.message : "invalid payload";
		throw new MarketDataError(
			`CoinGecko response validation failed: ${message}`,
		);
	}
}

export async function fetchCoinMarkets(
	options: CoinGeckoClientOptions,
	coingeckoIds: string[],
) {
	if (coingeckoIds.length === 0) {
		throw new MarketDataError("At least one CoinGecko asset id is required");
	}

	const params = new URLSearchParams({
		vs_currency: "usd",
		ids: coingeckoIds.join(","),
		price_change_percentage: "24h,7d,30d",
		order: "market_cap_desc",
		per_page: String(coingeckoIds.length),
		page: "1",
	});

	return fetchJson(
		options,
		`coins/markets?${params.toString()}`,
		CoinGeckoMarketListSchema,
	);
}

export async function fetchCoinVolumeTrend(
	options: CoinGeckoClientOptions,
	coingeckoId: string,
): Promise<VolumeTrend> {
	const params = new URLSearchParams({
		vs_currency: "usd",
		days: "7",
	});

	const chart = await fetchJson(
		options,
		`coins/${coingeckoId}/market_chart?${params.toString()}`,
		CoinGeckoMarketChartSchema,
	);

	return deriveVolumeTrend(chart.total_volumes);
}
