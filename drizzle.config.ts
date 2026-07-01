import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DATABASE_PATH ?? "data/accumula.db";

function resolveDatabaseUrl(): string {
	if (databasePath === ":memory:") {
		return ":memory:";
	}

	const resolved = path.isAbsolute(databasePath)
		? databasePath
		: path.resolve(projectRoot, databasePath);

	return `file:${resolved}`;
}

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/storage/schema.ts",
	out: "./drizzle",
	dbCredentials: {
		url: resolveDatabaseUrl(),
	},
});
