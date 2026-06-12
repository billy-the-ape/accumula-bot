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

export async function migrateDatabase(db: AppDatabase): Promise<void> {
	await migrate(db, { migrationsFolder });
}

export async function createDatabase(databasePath: string): Promise<{
	db: AppDatabase;
	client: Client;
}> {
	const connection = openDatabase(databasePath);
	await migrateDatabase(connection.db);
	return connection;
}
