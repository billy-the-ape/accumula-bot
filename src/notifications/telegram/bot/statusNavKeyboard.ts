import type { TelegramInlineKeyboard } from "@/notifications/telegram/bot/types.js";

export const NAV_CALLBACK_PREFIX = "nav:";

export function navCallbackData(
	command: "liquidate" | "portfolio" | "settings",
): string {
	return `${NAV_CALLBACK_PREFIX}${command}`;
}

export function parseNavCallback(
	data: string,
): "liquidate" | "portfolio" | "settings" | undefined {
	if (!data.startsWith(NAV_CALLBACK_PREFIX)) {
		return undefined;
	}

	const value = data.slice(NAV_CALLBACK_PREFIX.length);
	if (value === "liquidate" || value === "portfolio" || value === "settings") {
		return value;
	}

	return undefined;
}

export function buildStatusNavKeyboard(options: {
	isLive: boolean;
}): TelegramInlineKeyboard {
	const rows: TelegramInlineKeyboard["inline_keyboard"] = [
		[
			{
				text: "Portfolio Settings",
				callback_data: navCallbackData("portfolio"),
			},
			{
				text: "User Settings",
				callback_data: navCallbackData("settings"),
			},
		],
	];

	if (options.isLive) {
		rows.unshift([
			{
				text: "Close portfolio",
				callback_data: navCallbackData("liquidate"),
			},
		]);
	}

	return { inline_keyboard: rows };
}
