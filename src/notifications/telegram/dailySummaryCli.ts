import { loadConfig } from "@/config/index.js";
import { sendDailySummary } from "@/notifications/telegram/sendDailySummary.js";
import { createDatabase } from "@/storage/db.js";

async function main() {
	const config = loadConfig();

	if (!config.telegram) {
		console.error(
			"Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env",
		);
		process.exit(1);
	}

	const connection = await createDatabase(config.databasePath);

	try {
		await sendDailySummary(config, connection.db);
		console.info("Daily summary sent to Telegram");
	} finally {
		connection.client.close();
	}
}

main().catch((error: unknown) => {
	console.error("Failed to send daily summary:", error);
	process.exit(1);
});
