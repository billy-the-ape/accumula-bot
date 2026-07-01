export type PortfolioMode = "paper" | "live";

export type FundingStatus = "awaiting_deposit" | "funded" | "paused";

export const PORTFOLIO_MODES = [
	"paper",
	"live",
] as const satisfies readonly PortfolioMode[];

export const FUNDING_STATUSES = [
	"awaiting_deposit",
	"funded",
	"paused",
] as const satisfies readonly FundingStatus[];

export function isPortfolioMode(value: string): value is PortfolioMode {
	return (PORTFOLIO_MODES as readonly string[]).includes(value);
}

export function isFundingStatus(value: string): value is FundingStatus {
	return (FUNDING_STATUSES as readonly string[]).includes(value);
}
