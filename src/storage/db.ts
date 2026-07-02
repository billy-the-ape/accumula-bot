import crypto from "node:crypto";
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

const MIGRATION_0013_TAG = "0013_tired_wonder_man";

type MigrationJournalEntry = {
	tag: string;
	when: number;
	hash: string;
};

type MigrationAnalysis = {
	journalEntries: MigrationJournalEntry[];
	appliedHashes: Set<string>;
	appliedCount: number;
	lastCreatedAt: number | null;
	drizzlePendingTags: string[];
	journalGapTags: string[];
};

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

function loadMigrationJournalEntries(): MigrationJournalEntry[] {
	const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
	const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
		entries: Array<{ tag: string; when: number }>;
	};

	return journal.entries.map((entry) => {
		const sql = fs.readFileSync(
			path.join(migrationsFolder, `${entry.tag}.sql`),
			"utf8",
		);
		return {
			tag: entry.tag,
			when: entry.when,
			hash: crypto.createHash("sha256").update(sql).digest("hex"),
		};
	});
}

function getMigration0013Entry(
	entries: MigrationJournalEntry[],
): MigrationJournalEntry {
	const entry = entries.find(
		(candidate) => candidate.tag === MIGRATION_0013_TAG,
	);
	if (!entry) {
		throw new Error(
			`Missing migration journal entry for ${MIGRATION_0013_TAG}`,
		);
	}

	return entry;
}

async function readAppliedMigrationHashes(
	client: Client,
): Promise<Set<string>> {
	try {
		const result = await client.execute(
			"SELECT hash FROM __drizzle_migrations",
		);
		return new Set(result.rows.map((row) => String(row.hash)));
	} catch {
		return new Set();
	}
}

async function readLastMigrationCreatedAt(
	client: Client,
): Promise<number | null> {
	try {
		const result = await client.execute(
			"SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1",
		);
		const createdAt = result.rows[0]?.created_at;
		return createdAt === undefined ? null : Number(createdAt);
	} catch {
		return null;
	}
}

export async function analyzeMigrations(
	client: Client,
): Promise<MigrationAnalysis> {
	const journalEntries = loadMigrationJournalEntries();
	const appliedHashes = await readAppliedMigrationHashes(client);
	const lastCreatedAt = await readLastMigrationCreatedAt(client);

	const drizzlePendingTags = journalEntries
		.filter((entry) => lastCreatedAt === null || entry.when > lastCreatedAt)
		.map((entry) => entry.tag);

	const journalGapTags = journalEntries
		.filter((entry) => !appliedHashes.has(entry.hash))
		.filter((entry) => lastCreatedAt !== null && entry.when <= lastCreatedAt)
		.map((entry) => entry.tag);

	return {
		journalEntries,
		appliedHashes,
		appliedCount: appliedHashes.size,
		lastCreatedAt,
		drizzlePendingTags,
		journalGapTags,
	};
}

async function telegramUserSettingsColumnsPresent(
	client: Client,
): Promise<boolean> {
	try {
		const info = await client.execute("PRAGMA table_info(telegram_users)");
		const existing = new Set(info.rows.map((row) => String(row.name)));
		return (
			existing.has("default_risk_tolerance") &&
			existing.has("locale") &&
			existing.has("timezone")
		);
	} catch {
		return false;
	}
}

/** Record migration 0013 when schema repair already applied its columns. */
export async function reconcileMigration0013Record(
	client: Client,
): Promise<boolean> {
	const migration0013 = getMigration0013Entry(loadMigrationJournalEntries());
	const appliedHashes = await readAppliedMigrationHashes(client);

	if (appliedHashes.has(migration0013.hash)) {
		return false;
	}

	if (!(await telegramUserSettingsColumnsPresent(client))) {
		return false;
	}

	await client.execute({
		sql: 'INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES (?, ?)',
		args: [migration0013.hash, migration0013.when],
	});
	console.info(
		`Reconciled migration ${MIGRATION_0013_TAG} (schema already matched journal)`,
	);
	return true;
}

/** Align __drizzle_migrations.created_at with journal when values after timestamp repairs. */
export async function reconcileMigrationJournalTimestamps(
	client: Client,
): Promise<string[]> {
	const entries = loadMigrationJournalEntries();
	const reconciled: string[] = [];

	try {
		for (const entry of entries) {
			const result = await client.execute({
				sql: "UPDATE __drizzle_migrations SET created_at = ? WHERE hash = ? AND created_at != ?",
				args: [entry.when, entry.hash, entry.when],
			});
			if (result.rowsAffected > 0) {
				reconciled.push(entry.tag);
			}
		}
	} catch {
		return [];
	}

	if (reconciled.length > 0) {
		console.info(
			`Reconciled migration journal timestamps: ${reconciled.join(", ")}`,
		);
	}

	return reconciled;
}

function logMigrationStatus(
	resolvedPath: string,
	analysis: MigrationAnalysis,
): void {
	console.info(`Opening database: ${resolvedPath}`);
	console.info(
		`Migration journal: ${analysis.appliedCount}/${analysis.journalEntries.length} recorded in __drizzle_migrations`,
	);

	if (analysis.drizzlePendingTags.length > 0) {
		console.info(
			`Pending migrations: ${analysis.drizzlePendingTags.length} (${analysis.drizzlePendingTags.join(", ")})`,
		);
	}

	if (analysis.journalGapTags.length > 0) {
		console.warn(
			`Migration journal gap: ${analysis.journalGapTags.length} (${analysis.journalGapTags.join(", ")}) — recorded out of timestamp order; Drizzle skips these unless reconciled`,
		);
	}
}

function logMigrationResult(
	before: MigrationAnalysis,
	after: MigrationAnalysis,
): void {
	const newlyApplied = after.appliedCount - before.appliedCount;

	if (newlyApplied > 0) {
		const tags = after.journalEntries
			.filter((entry) => !before.appliedHashes.has(entry.hash))
			.filter((entry) => after.appliedHashes.has(entry.hash))
			.map((entry) => entry.tag);
		console.info(`Applied ${newlyApplied} migration(s): ${tags.join(", ")}`);
		return;
	}

	const fullySynced =
		after.appliedCount === after.journalEntries.length &&
		after.drizzlePendingTags.length === 0 &&
		after.journalGapTags.length === 0;

	if (fullySynced) {
		console.info(
			`Database schema up to date (${after.appliedCount}/${after.journalEntries.length} migrations applied)`,
		);
		return;
	}

	console.warn(
		`No new migrations applied (${after.appliedCount}/${after.journalEntries.length} recorded)`,
	);

	if (after.drizzlePendingTags.length > 0) {
		console.warn(`Still pending: ${after.drizzlePendingTags.join(", ")}`);
	}

	if (after.journalGapTags.length > 0) {
		console.warn(`Unresolved journal gaps: ${after.journalGapTags.join(", ")}`);
	}
}

export async function logAndMigrateDatabase(
	db: AppDatabase,
	client: Client,
	databasePath: string,
): Promise<void> {
	const resolvedPath = resolveDatabasePath(databasePath);
	let before = await analyzeMigrations(client);
	logMigrationStatus(resolvedPath, before);

	await reconcileMigration0013Record(client);
	await reconcileMigrationJournalTimestamps(client);
	before = await analyzeMigrations(client);

	await migrateDatabase(db);

	const after = await analyzeMigrations(client);
	logMigrationResult(before, after);
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
	await reconcileMigration0013Record(connection.client);
	return connection;
}
