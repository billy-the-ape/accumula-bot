import { loadConfig } from "@/config/index.js";
import { sendDailySummary } from "@/notifications/telegram/sendDailySummary.js";
import { createDatabase } from "@/storage/db.js";
import { getLatestMacroBriefing } from "@/storage/repositories/macroBriefingRepository.js";

async function main() {
	const config = loadConfig();

	if (!config.telegram?.botToken) {
		console.error("Telegram is not configured. Set TELEGRAM_BOT_TOKEN in .env");
		process.exit(1);
	}

	const connection = await createDatabase(config.databasePath);

	try {
		const latestBriefing = await getLatestMacroBriefing(connection.db);
		const result = await sendDailySummary(config, connection.db, {
			...(latestBriefing
				? {
						macroBriefing: {
							content: latestBriefing.content,
							generatedAt: latestBriefing.createdAt,
						},
					}
				: {}),
		});

		if (result.sentCount === 0) {
			console.info("No active portfolios — daily summary skipped");
			return;
		}

		console.info(
			latestBriefing
				? `Daily briefing sent to ${result.sentCount} user(s): ${result.recipientChatIds.join(", ")}`
				: `Daily summary sent to ${result.sentCount} user(s): ${result.recipientChatIds.join(", ")}`,
		);
	} finally {
		connection.client.close();
	}
}

main().catch((error: unknown) => {
	console.error("Failed to send daily summary:", error);
	process.exit(1);
});
