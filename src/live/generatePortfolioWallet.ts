import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export type GeneratedPortfolioWallet = {
	address: `0x${string}`;
	privateKey: `0x${string}`;
};

export function generatePortfolioWallet(): GeneratedPortfolioWallet {
	const privateKey = generatePrivateKey();
	const account = privateKeyToAccount(privateKey);
	return {
		address: account.address,
		privateKey,
	};
}
