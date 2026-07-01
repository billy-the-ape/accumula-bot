import { isAddress } from "viem";

export function parseDestinationWalletAddress(
	value: string,
): { ok: true; address: `0x${string}` } | { ok: false; reason: string } {
	const trimmed = value.trim();
	if (!trimmed.startsWith("0x")) {
		return { ok: false, reason: "Address must start with 0x." };
	}

	if (!isAddress(trimmed, { strict: false })) {
		return { ok: false, reason: "Invalid Ethereum address." };
	}

	return { ok: true, address: trimmed as `0x${string}` };
}

export function isSameWalletAddress(left: string, right: string): boolean {
	return left.toLowerCase() === right.toLowerCase();
}
