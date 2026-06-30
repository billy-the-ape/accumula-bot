import { loadConfig } from "@/config/index.js";
import {
	cleanupPortfolios,
	type PortfolioCleanupScope,
	previewPortfolioCleanup,
} from "@/storage/cleanupPortfolios.js";
import { createDatabase } from "@/storage/db.js";

type CliOptions = {
	scope: PortfolioCleanupScope;
	execute: boolean;
};

function parseCliOptions(argv: readonly string[]): CliOptions {
	const scope: PortfolioCleanupScope = argv.includes("--all")
		? "all"
		: "legacy";
	const execute = argv.includes("--yes");

	return { scope, execute };
}

function formatScopeLabel(scope: PortfolioCleanupScope): string {
	return scope === "all"
		? "all portfolios and Telegram users"
		: "legacy portfolios (no linked Telegram user)";
}

function logPreview(
	counts: Awaited<ReturnType<typeof previewPortfolioCleanup>>,
): void {
	console.info(`Cleanup scope: ${formatScopeLabel(counts.scope)}`);
	console.info(`Portfolios to remove: ${counts.portfolios}`);
	console.info(`Positions to remove: ${counts.positions}`);
	console.info(`Trades to remove: ${counts.trades}`);

	if (counts.scope === "all") {
		console.info(`Telegram users to remove: ${counts.telegramUsers}`);
	}

	console.info("");
	console.info("Preserved (unchanged):");
	console.info("  • decisions");
	console.info("  • social_media_posts");
	console.info("  • macro_briefings");
}

async function main() {
	const options = parseCliOptions(process.argv.slice(2));
	const config = loadConfig();
	const connection = await createDatabase(config.databasePath);

	try {
		if (!options.execute) {
			const preview = await previewPortfolioCleanup(
				connection.db,
				options.scope,
			);
			logPreview(preview);

			if (preview.portfolios === 0) {
				console.info("Nothing to clean up.");
				return;
			}

			console.info("");
			console.info("Dry run only. Re-run with --yes to delete the rows above.");
			if (options.scope === "legacy") {
				console.info(
					"To remove every portfolio: pnpm db:cleanup-legacy -- --all --yes",
				);
			}
			return;
		}

		const result = await cleanupPortfolios(connection.db, options.scope);
		logPreview(result);

		if (result.portfolios === 0) {
			console.info("Nothing was deleted.");
			return;
		}

		console.info("");
		console.info("Cleanup complete.");
		if (options.scope === "all") {
			console.info(
				"Users must /start the Telegram bot to create new portfolios.",
			);
		}
	} finally {
		connection.client.close();
	}
}

main().catch((error: unknown) => {
	console.error("Portfolio cleanup failed:", error);
	process.exit(1);
});
