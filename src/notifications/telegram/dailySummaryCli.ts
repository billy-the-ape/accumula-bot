import { loadConfig } from "@/config/index.js";
import { sendDailySummary } from "@/notifications/telegram/sendDailySummary.js";
import { createDatabase } from "@/storage/db.js";
import { getLatestMacroBriefing } from "@/storage/repositories/macroBriefingRepository.js";

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
		const latestBriefing = await getLatestMacroBriefing(connection.db);
		await sendDailySummary(config, connection.db, {
			...(latestBriefing
				? {
						macroBriefing: {
							content: latestBriefing.content,
							generatedAt: latestBriefing.createdAt,
						},
					}
				: {}),
		});
		console.info(
			latestBriefing
				? "Daily briefing sent to Telegram (macro + portfolio summary)"
				: "Daily summary sent to Telegram",
		);
	} finally {
		connection.client.close();
	}
}

main().catch((error: unknown) => {
	console.error("Failed to send daily summary:", error);
	process.exit(1);
});
