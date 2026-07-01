import type { TelegramInlineKeyboard } from "@/notifications/telegram/bot/types.js";

export const NAV_CALLBACK_PREFIX = "nav:";

export const NAV_LIQUIDATE_CONFIRM_CALLBACK = `${NAV_CALLBACK_PREFIX}liquidate_confirm`;
export const NAV_LIQUIDATE_CANCEL_CALLBACK = `${NAV_CALLBACK_PREFIX}liquidate_cancel`;
export const NAV_RESET_CONFIRM_CALLBACK = `${NAV_CALLBACK_PREFIX}reset_confirm`;
export const NAV_RESET_CANCEL_CALLBACK = `${NAV_CALLBACK_PREFIX}reset_cancel`;

export function navCallbackData(
	command: "liquidate" | "reset" | "portfolio" | "settings",
): string {
	return `${NAV_CALLBACK_PREFIX}${command}`;
}

export function parseNavCallback(
	data: string,
): "liquidate" | "reset" | "portfolio" | "settings" | undefined {
	if (!data.startsWith(NAV_CALLBACK_PREFIX)) {
		return undefined;
	}

	const value = data.slice(NAV_CALLBACK_PREFIX.length);
	if (
		value === "liquidate" ||
		value === "reset" ||
		value === "portfolio" ||
		value === "settings"
	) {
		return value;
	}

	return undefined;
}

export function parseNavLiquidateConfirmCallback(
	data: string,
): "confirm" | "cancel" | undefined {
	if (data === NAV_LIQUIDATE_CONFIRM_CALLBACK) {
		return "confirm";
	}
	if (data === NAV_LIQUIDATE_CANCEL_CALLBACK) {
		return "cancel";
	}
	return undefined;
}

export function parseNavResetConfirmCallback(
	data: string,
): "confirm" | "cancel" | undefined {
	if (data === NAV_RESET_CONFIRM_CALLBACK) {
		return "confirm";
	}
	if (data === NAV_RESET_CANCEL_CALLBACK) {
		return "cancel";
	}
	return undefined;
}

export function buildStatusNavKeyboard(options: {
	isLive: boolean;
}): TelegramInlineKeyboard {
	const rows: TelegramInlineKeyboard["inline_keyboard"] = [
		[
			{
				text: "📂 Portfolio Settings",
				callback_data: navCallbackData("portfolio"),
			},
		],
		[
			{
				text: "⚙️ User Settings",
				callback_data: navCallbackData("settings"),
			},
		],
	];

	rows.push([
		{
			text: "🚫 Close portfolio",
			callback_data: navCallbackData(options.isLive ? "liquidate" : "reset"),
			style: "danger",
		},
	]);

	return { inline_keyboard: rows };
}

export function buildNavLiquidateConfirmKeyboard(): TelegramInlineKeyboard {
	return {
		inline_keyboard: [
			[
				{
					text: "Yes, close portfolio",
					callback_data: NAV_LIQUIDATE_CONFIRM_CALLBACK,
					style: "danger",
				},
				{
					text: "Cancel",
					callback_data: NAV_LIQUIDATE_CANCEL_CALLBACK,
				},
			],
		],
	};
}

export function buildNavResetConfirmKeyboard(): TelegramInlineKeyboard {
	return {
		inline_keyboard: [
			[
				{
					text: "Yes, close portfolio",
					callback_data: NAV_RESET_CONFIRM_CALLBACK,
					style: "danger",
				},
				{
					text: "Cancel",
					callback_data: NAV_RESET_CANCEL_CALLBACK,
				},
			],
		],
	};
}
