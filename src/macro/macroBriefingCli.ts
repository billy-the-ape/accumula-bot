import { loadConfig } from "@/config/index.js";
import { generateMacroBriefing } from "@/macro/generateMacroBriefing.js";
import { sendDailySummary } from "@/notifications/telegram/sendDailySummary.js";
import { createDatabase } from "@/storage/db.js";
import { saveMacroBriefing } from "@/storage/repositories/macroBriefingRepository.js";

async function main() {
	const config = loadConfig();
	const connection = await createDatabase(config.databasePath);

	try {
		const generated = await generateMacroBriefing(config);
		const saved = await saveMacroBriefing(connection.db, {
			content: generated.content,
			promptVersion: generated.promptVersion,
			llm: {
				provider: generated.llm.provider,
				model: generated.llm.model,
			},
		});

		const wordCount = saved.content.split(/\s+/).length;
		console.info(
			`Macro briefing saved (id=${saved.id}, createdAt=${saved.createdAt.toISOString()}, promptVersion=${saved.promptVersion}, provider=${saved.llm.provider}, model=${saved.llm.model}, words≈${wordCount})`,
		);

		if (config.telegram) {
			await sendDailySummary(config, connection.db, {
				macroBriefing: {
					content: saved.content,
					generatedAt: saved.createdAt,
				},
			});
			console.info(
				"Daily briefing sent to Telegram (macro + portfolio summary)",
			);
		} else {
			console.info(
				"Telegram not configured; skipping daily briefing notification (set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.macro)",
			);
		}
	} finally {
		connection.client.close();
	}
}

main().catch((error: unknown) => {
	console.error("Failed to generate macro briefing:", error);
	process.exit(1);
});
