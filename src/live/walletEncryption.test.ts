import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	decryptPrivateKey,
	encryptPrivateKey,
	parseWalletEncryptionKey,
	WalletEncryptionError,
} from "@/live/walletEncryption.js";

const TEST_KEY = parseWalletEncryptionKey(randomBytes(32).toString("hex"));
const TEST_PRIVATE_KEY =
	"0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("walletEncryption", () => {
	it("encrypts and decrypts a private key round-trip", () => {
		const blob = encryptPrivateKey(TEST_PRIVATE_KEY, TEST_KEY);
		expect(decryptPrivateKey(blob, TEST_KEY)).toBe(TEST_PRIVATE_KEY);
	});

	it("stores private keys without 0x prefix in ciphertext", () => {
		const iv = randomBytes(12);
		const blob = encryptPrivateKey(TEST_PRIVATE_KEY, TEST_KEY, iv);
		const decrypted = decryptPrivateKey(blob, TEST_KEY);
		expect(decrypted).toBe(TEST_PRIVATE_KEY);
	});

	it("rejects invalid encryption keys", () => {
		expect(() => parseWalletEncryptionKey("too-short")).toThrow(
			WalletEncryptionError,
		);
	});

	it("rejects malformed encrypted blobs", () => {
		expect(() => decryptPrivateKey("bad-blob", TEST_KEY)).toThrow(
			WalletEncryptionError,
		);
	});
});
