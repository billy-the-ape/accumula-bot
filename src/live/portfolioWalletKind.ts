export type PortfolioWalletKind = "eoa" | "smart_account";

export function isPortfolioWalletKind(
	value: string,
): value is PortfolioWalletKind {
	return value === "eoa" || value === "smart_account";
}

export function parsePortfolioWalletKind(
	value: string | null | undefined,
): PortfolioWalletKind {
	if (value && isPortfolioWalletKind(value)) {
		return value;
	}
	return "eoa";
}
