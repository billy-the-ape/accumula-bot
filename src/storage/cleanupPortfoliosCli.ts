import { loadConfig } from "@/config/index.js";
import {
	cleanupPortfolios,
	previewPortfolioCleanup,
} from "@/storage/cleanupPortfolios.js";
import { createDatabase } from "@/storage/db.js";

function parseExecuteFlag(argv: readonly string[]): boolean {
	return argv.includes("--yes");
}

function logPreview(
	counts: Awaited<ReturnType<typeof previewPortfolioCleanup>>,
): void {
	console.info("Cleanup scope: all portfolio data");
	console.info(`Portfolios to remove: ${counts.portfolios}`);
	console.info(`Positions to remove: ${counts.positions}`);
	console.info(`Trades to remove: ${counts.trades}`);

	console.info("");
	console.info("Preserved (unchanged):");
	console.info("  • telegram_users");
	console.info("  • decisions");
	console.info("  • social_media_posts");
	console.info("  • macro_briefings");
}

async function main() {
	const execute = parseExecuteFlag(process.argv.slice(2));
	const config = loadConfig();
	const connection = await createDatabase(config.databasePath);

	try {
		if (!execute) {
			const preview = await previewPortfolioCleanup(connection.db);
			logPreview(preview);

			if (preview.portfolios === 0) {
				console.info("Nothing to clean up.");
				return;
			}

			console.info("");
			console.info("Dry run only. Re-run with --yes to delete the rows above.");
			return;
		}

		const result = await cleanupPortfolios(connection.db);
		logPreview(result);

		if (result.portfolios === 0) {
			console.info("Nothing was deleted.");
			return;
		}

		console.info("");
		console.info("Cleanup complete.");
		console.info(
			"Users must /start the Telegram bot to create new portfolios.",
		);
	} finally {
		connection.client.close();
	}
}

main().catch((error: unknown) => {
	console.error("Portfolio cleanup failed:", error);
	process.exit(1);
});
