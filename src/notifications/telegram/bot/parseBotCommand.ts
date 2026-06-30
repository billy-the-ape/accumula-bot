import type { BotCommand } from "@/notifications/telegram/bot/types.js";

const BOT_COMMANDS = new Set<BotCommand>([
	"start",
	"status",
	"summary",
	"reset",
	"default",
]);

export function parseBotCommand(text: string): BotCommand | undefined {
	const trimmed = text.trim();
	if (!trimmed.startsWith("/")) {
		return undefined;
	}

	const commandPart = trimmed.slice(1).split(/\s+/)[0]?.split("@")[0];
	if (!commandPart) {
		return undefined;
	}

	const command = commandPart.toLowerCase();
	return BOT_COMMANDS.has(command as BotCommand)
		? (command as BotCommand)
		: undefined;
}
