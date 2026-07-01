import { assertSupportedDepositChainId } from "@/config/chainAssets.js";
import { loadConfig } from "@/config/index.js";
import { logCdpPaymasterStartupProbe } from "@/live/cdpPaymaster.js";
import { resumePendingLiveDepositPolls } from "@/live/liveDepositPoller.js";
import { parseTelegramUpdate } from "@/notifications/telegram/bot/parseTelegramUpdate.js";
import { processTelegramUpdate } from "@/notifications/telegram/processTelegramUpdate.js";
import { runTelegramPoll } from "@/notifications/telegram/telegramPolling.js";
import { createDatabase } from "@/storage/db.js";

async function main() {
	const config = loadConfig();

	if (!config.telegram?.botToken) {
		console.error(
			"Telegram bot is not configured. Set TELEGRAM_BOT_TOKEN in .env",
		);
		process.exit(1);
	}

	const connection = await createDatabase(config.databasePath);
	const controller = new AbortController();

	const shutdown = () => {
		console.info("Telegram bot shutting down...");
		controller.abort();
	};

	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);

	console.info("Telegram bot starting (long poll)");
	console.info(`Database: ${config.databasePath}`);
	if (config.live.cdpPaymasterRpcUrl) {
		const policyHint = config.live.cdpGasPolicyId
			? `optional policyId=${config.live.cdpGasPolicyId}`
			: "default policy via RPC URL";
		console.info(
			`CDP paymaster: enabled (CDP_GAS_PAYMENT_MODE=${config.live.cdpGasPaymentMode}, ${policyHint})`,
		);
		await logCdpPaymasterStartupProbe({
			rpcUrl: config.live.cdpPaymasterRpcUrl,
			chainId: assertSupportedDepositChainId(config.live.depositChainId),
			gasPaymentMode: config.live.cdpGasPaymentMode,
		});
	} else {
		console.info("CDP paymaster: not configured (CDP_PAYMASTER_RPC_URL unset)");
	}

	await resumePendingLiveDepositPolls(connection.db, config);

	try {
		await runTelegramPoll({
			botToken: config.telegram.botToken,
			signal: controller.signal,
			onError: (error) => {
				const message =
					error instanceof Error ? error.message : "unknown error";
				console.error(`Telegram poll error: ${message}`);
			},
			onUpdate: async (update) => {
				const event = parseTelegramUpdate(update);
				if (!event) {
					return;
				}

				try {
					await processTelegramUpdate(connection.db, config, event);
					console.info(
						`Telegram update ${event.updateId} handled for chat ${event.chatId}`,
					);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "unknown error";
					console.error(
						`Failed to handle Telegram update ${event.updateId}: ${message}`,
					);
				}
			},
		});
	} finally {
		connection.client.close();
		console.info("Telegram bot stopped");
	}
}

main().catch((error: unknown) => {
	console.error("Failed to start Telegram bot:", error);
	process.exit(1);
});
