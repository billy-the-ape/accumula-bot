/** Holdings keyed by asset symbol. Zero or missing means no position. */
export type PortfolioHoldings = Readonly<Record<string, number>>;

export type Portfolio = {
	holdings: PortfolioHoldings;
};

/** Quote-currency prices (e.g. USD) keyed by asset symbol. */
export type PriceMap = Readonly<Record<string, number>>;
