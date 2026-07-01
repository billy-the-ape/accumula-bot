import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export class WalletEncryptionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WalletEncryptionError";
	}
}

export function parseWalletEncryptionKey(hexKey: string): Buffer {
	const normalized = hexKey.trim();
	if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
		throw new WalletEncryptionError(
			"WALLET_ENCRYPTION_KEY must be 64 hex characters (32 bytes)",
		);
	}
	return Buffer.from(normalized, "hex");
}

/** Returns iv:tag:ciphertext hex blob (private key stored without 0x prefix). */
export function encryptPrivateKey(
	privateKeyHex: string,
	key: Buffer,
	iv: Buffer = randomBytes(IV_BYTES),
): string {
	const normalized = privateKeyHex.startsWith("0x")
		? privateKeyHex.slice(2)
		: privateKeyHex;
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const encrypted = Buffer.concat([
		cipher.update(normalized, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptPrivateKey(blob: string, key: Buffer): `0x${string}` {
	const parts = blob.split(":");
	if (parts.length !== 3) {
		throw new WalletEncryptionError("Invalid encrypted private key blob");
	}
	const [ivHex, tagHex, dataHex] = parts as [string, string, string];
	const iv = Buffer.from(ivHex, "hex");
	const tag = Buffer.from(tagHex, "hex");
	const data = Buffer.from(dataHex, "hex");
	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(tag);
	const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
	return `0x${decrypted.toString("utf8")}`;
}
