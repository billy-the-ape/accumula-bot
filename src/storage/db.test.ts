import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import {
	ensureTelegramUserSettingsColumns,
	openDatabase,
} from "@/storage/db.js";

describe("ensureTelegramUserSettingsColumns", () => {
	let client: Client | undefined;

	afterEach(() => {
		client?.close();
		client = undefined;
	});

	it("adds missing telegram user settings columns", async () => {
		const connection = openDatabase(":memory:");
		client = connection.client;

		await client.execute(
			"CREATE TABLE telegram_users (id INTEGER PRIMARY KEY, verbose INTEGER NOT NULL DEFAULT 0)",
		);

		await ensureTelegramUserSettingsColumns(client);

		const info = await client.execute("PRAGMA table_info(telegram_users)");
		const names = info.rows.map((row) => String(row.name));

		expect(names).toContain("default_risk_tolerance");
		expect(names).toContain("locale");
		expect(names).toContain("timezone");
	});
});
