import { describe, expect, it } from "vitest";
import {
	buildStatusNavKeyboard,
	NAV_LIQUIDATE_CANCEL_CALLBACK,
	NAV_LIQUIDATE_CONFIRM_CALLBACK,
	parseNavLiquidateConfirmCallback,
} from "@/notifications/telegram/bot/statusNavKeyboard.js";

describe("buildStatusNavKeyboard", () => {
	it("puts settings above close portfolio for live portfolios", () => {
		const keyboard = buildStatusNavKeyboard({ isLive: true });

		expect(keyboard.inline_keyboard).toHaveLength(3);
		expect(keyboard.inline_keyboard[0]?.map((button) => button.text)).toEqual([
			"📂 Portfolio Settings",
		]);
		expect(keyboard.inline_keyboard[1]?.map((button) => button.text)).toEqual([
			"⚙️ User Settings",
		]);
		expect(keyboard.inline_keyboard[2]?.[0]).toMatchObject({
			text: "🚫 Close portfolio",
			style: "danger",
		});
	});
});

describe("parseNavLiquidateConfirmCallback", () => {
	it("parses confirm and cancel callbacks", () => {
		expect(
			parseNavLiquidateConfirmCallback(NAV_LIQUIDATE_CONFIRM_CALLBACK),
		).toBe("confirm");
		expect(
			parseNavLiquidateConfirmCallback(NAV_LIQUIDATE_CANCEL_CALLBACK),
		).toBe("cancel");
	});
});
