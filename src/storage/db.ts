import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "@/storage/schema.js";

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

const migrationsFolder = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../drizzle",
);

export function resolveDatabasePath(databasePath: string): string {
	return path.isAbsolute(databasePath)
		? databasePath
		: path.resolve(process.cwd(), databasePath);
}

export function resolveDatabaseUrl(databasePath: string): string {
	if (databasePath === ":memory:") {
		return ":memory:";
	}

	return `file:${resolveDatabasePath(databasePath)}`;
}

export function ensureDatabaseDirectory(databasePath: string): void {
	if (databasePath === ":memory:") {
		return;
	}

	const resolvedPath = resolveDatabasePath(databasePath);
	const directory = path.dirname(resolvedPath);
	if (!fs.existsSync(directory)) {
		fs.mkdirSync(directory, { recursive: true });
	}
}

export function openDatabase(databasePath: string): {
	db: AppDatabase;
	client: Client;
} {
	ensureDatabaseDirectory(databasePath);
	const client = createClient({ url: resolveDatabaseUrl(databasePath) });
	const db = drizzle(client, { schema });

	return { db, client };
}

type MigrationJournal = {
	entries: Array<{ tag: string }>;
};

function loadMigrationJournalTags(): string[] {
	const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
	const journal = JSON.parse(
		fs.readFileSync(journalPath, "utf8"),
	) as MigrationJournal;

	return journal.entries.map((entry) => entry.tag);
}

async function readAppliedMigrationCount(client: Client): Promise<number> {
	try {
		const result = await client.execute(
			"SELECT COUNT(*) AS count FROM __drizzle_migrations",
		);
		return Number(result.rows[0]?.count ?? 0);
	} catch {
		return 0;
	}
}

export async function logAndMigrateDatabase(
	db: AppDatabase,
	client: Client,
	databasePath: string,
): Promise<void> {
	const resolvedPath = resolveDatabasePath(databasePath);
	const journalTags = loadMigrationJournalTags();
	const appliedBefore = await readAppliedMigrationCount(client);
	const pendingBefore = Math.max(journalTags.length - appliedBefore, 0);

	console.info(`Opening database: ${resolvedPath}`);

	if (pendingBefore > 0) {
		console.info(
			`Pending migrations: ${pendingBefore} (${journalTags.slice(appliedBefore).join(", ")})`,
		);
	}

	await migrateDatabase(db);

	const appliedAfter = await readAppliedMigrationCount(client);
	const newlyApplied = appliedAfter - appliedBefore;

	if (newlyApplied > 0) {
		const tags = journalTags.slice(appliedBefore, appliedAfter);
		console.info(`Applied ${newlyApplied} migration(s): ${tags.join(", ")}`);
	} else {
		console.info(
			`Database schema up to date (${appliedAfter}/${journalTags.length} migrations applied)`,
		);
	}

	const stillPending = journalTags.length - appliedAfter;
	if (stillPending > 0) {
		console.warn(
			`Warning: ${stillPending} migration(s) still pending after migrate: ${journalTags.slice(appliedAfter).join(", ")}`,
		);
	}
}

export async function migrateDatabase(db: AppDatabase): Promise<void> {
	await migrate(db, { migrationsFolder });
}

const TELEGRAM_USER_SETTINGS_REPAIR_COLUMNS = [
	{
		name: "default_risk_tolerance",
		sql: "ALTER TABLE `telegram_users` ADD `default_risk_tolerance` text DEFAULT 'medium' NOT NULL",
	},
	{
		name: "locale",
		sql: "ALTER TABLE `telegram_users` ADD `locale` text",
	},
	{
		name: "timezone",
		sql: "ALTER TABLE `telegram_users` ADD `timezone` text",
	},
] as const;

/** Idempotent repair when migration 0013 did not reach the runtime database file. */
export async function ensureTelegramUserSettingsColumns(
	client: Client,
): Promise<string[]> {
	const info = await client.execute("PRAGMA table_info(telegram_users)");
	const existing = new Set(info.rows.map((row) => String(row.name)));
	const repaired: string[] = [];

	for (const column of TELEGRAM_USER_SETTINGS_REPAIR_COLUMNS) {
		if (existing.has(column.name)) {
			continue;
		}

		await client.execute(column.sql);
		repaired.push(column.name);
		console.info(`Applied schema repair: added telegram_users.${column.name}`);
	}

	return repaired;
}

function logSchemaRepairSummary(repairedColumns: string[]): void {
	if (repairedColumns.length === 0) {
		console.info("Schema repair: no drift detected");
		return;
	}

	console.warn(
		`Schema repair: added ${repairedColumns.length} column(s) (${repairedColumns.join(", ")}) — migration journal may be out of sync with schema`,
	);
}

export async function createDatabase(databasePath: string): Promise<{
	db: AppDatabase;
	client: Client;
}> {
	const connection = openDatabase(databasePath);
	await logAndMigrateDatabase(connection.db, connection.client, databasePath);
	const repairedColumns = await ensureTelegramUserSettingsColumns(
		connection.client,
	);
	logSchemaRepairSummary(repairedColumns);
	return connection;
}
