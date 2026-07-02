import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Client } from "@libsql/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	analyzeMigrations,
	createDatabase,
	ensureTelegramUserSettingsColumns,
	logAndMigrateDatabase,
	openDatabase,
	reconcileMigration0013Record,
	reconcileMigrationJournalTimestamps,
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

		const repaired = await ensureTelegramUserSettingsColumns(client);

		const info = await client.execute("PRAGMA table_info(telegram_users)");
		const names = info.rows.map((row) => String(row.name));

		expect(repaired).toEqual(["default_risk_tolerance", "locale", "timezone"]);
		expect(names).toContain("default_risk_tolerance");
		expect(names).toContain("locale");
		expect(names).toContain("timezone");
	});
});

describe("reconcileMigration0013Record", () => {
	let client: Client | undefined;
	let dbPath: string | undefined;

	afterEach(() => {
		client?.close();
		client = undefined;
		if (dbPath) {
			try {
				fs.rmSync(dbPath, { force: true });
			} catch {
				// Windows may briefly lock the file after close.
			}
			dbPath = undefined;
		}
	});

	it("records migration 0013 when columns exist but journal row is missing", async () => {
		dbPath = path.join(
			os.tmpdir(),
			`accumula-db-reconcile-${Date.now()}-${Math.random()}.db`,
		);

		const connection = await createDatabase(dbPath);
		const migration0013 = (
			await analyzeMigrations(connection.client)
		).journalEntries.find((entry) => entry.tag === "0013_tired_wonder_man");
		expect(migration0013).toBeDefined();
		if (!migration0013) {
			throw new Error("expected migration 0013");
		}

		await connection.client.execute({
			sql: "DELETE FROM __drizzle_migrations WHERE hash = ?",
			args: [migration0013.hash],
		});

		const reconciled = await reconcileMigration0013Record(connection.client);
		const after = await analyzeMigrations(connection.client);

		expect(reconciled).toBe(true);
		expect(after.appliedCount).toBe(15);
		expect(after.journalGapTags).toEqual([]);
		connection.client.close();
	});
});

describe("reconcileMigrationJournalTimestamps", () => {
	let client: Client | undefined;
	let dbPath: string | undefined;

	afterEach(() => {
		client?.close();
		client = undefined;
		if (dbPath) {
			try {
				fs.rmSync(dbPath, { force: true });
			} catch {
				// Windows may briefly lock the file after close.
			}
			dbPath = undefined;
		}
	});

	it("aligns inflated created_at values so pending migrations are not journal gaps", async () => {
		dbPath = path.join(
			os.tmpdir(),
			`accumula-db-ts-reconcile-${Date.now()}-${Math.random()}.db`,
		);

		const connection = await createDatabase(dbPath);
		const entries = (await analyzeMigrations(connection.client)).journalEntries;
		const inflatedTags = [
			"0010_trade_tx_hash",
			"0011_liquidation_withdrawals",
			"0012_portfolio_wallet_kind",
			"0013_tired_wonder_man",
		];

		for (const tag of inflatedTags) {
			const entry = entries.find((candidate) => candidate.tag === tag);
			expect(entry).toBeDefined();
			if (!entry) {
				throw new Error(`expected migration ${tag}`);
			}

			await connection.client.execute({
				sql: "UPDATE __drizzle_migrations SET created_at = ? WHERE hash = ?",
				args: [1783300000000, entry.hash],
			});
		}

		const migration0014 = entries.find(
			(entry) => entry.tag === "0014_lowly_war_machine",
		);
		expect(migration0014).toBeDefined();
		if (!migration0014) {
			throw new Error("expected migration 0014");
		}

		await connection.client.execute({
			sql: "DELETE FROM __drizzle_migrations WHERE hash = ?",
			args: [migration0014.hash],
		});

		const before = await analyzeMigrations(connection.client);
		expect(before.journalGapTags).toContain("0014_lowly_war_machine");

		const reconciled = await reconcileMigrationJournalTimestamps(
			connection.client,
		);
		expect(reconciled).toEqual(inflatedTags);

		const afterReconcile = await analyzeMigrations(connection.client);
		expect(afterReconcile.journalGapTags).toEqual([]);
		expect(afterReconcile.drizzlePendingTags).toContain(
			"0014_lowly_war_machine",
		);

		connection.client.close();
	});
});

describe("logAndMigrateDatabase", () => {
	let client: Client | undefined;
	let dbPath: string | undefined;

	afterEach(() => {
		client?.close();
		client = undefined;
		if (dbPath) {
			try {
				fs.rmSync(dbPath, { force: true });
			} catch {
				// Windows may briefly lock the file after close.
			}
			dbPath = undefined;
		}
		vi.restoreAllMocks();
	});

	it("logs up-to-date schema on second open", async () => {
		dbPath = path.join(
			os.tmpdir(),
			`accumula-db-log-${Date.now()}-${Math.random()}.db`,
		);
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

		const firstConnection = await createDatabase(dbPath);
		firstConnection.client.close();
		infoSpy.mockClear();

		const connection = openDatabase(dbPath);
		client = connection.client;
		await logAndMigrateDatabase(connection.db, client, dbPath);

		expect(infoSpy).toHaveBeenCalledWith(
			expect.stringMatching(/^Opening database: /),
		);
		expect(infoSpy).toHaveBeenCalledWith(
			"Database schema up to date (15/15 migrations applied)",
		);
	});
});
