export const LIQUIDATE_CONFIRM_CALLBACK = "liquidate:confirm";
export const LIQUIDATE_CANCEL_CALLBACK = "liquidate:cancel";

export function buildLiquidationConfirmKeyboard() {
	return {
		inline_keyboard: [
			[
				{
					text: "Confirm Liquidate",
					callback_data: LIQUIDATE_CONFIRM_CALLBACK,
				},
				{ text: "Cancel", callback_data: LIQUIDATE_CANCEL_CALLBACK },
			],
		],
	};
}

export function parseLiquidationCallback(
	data: string,
): "confirm" | "cancel" | undefined {
	if (data === LIQUIDATE_CONFIRM_CALLBACK) {
		return "confirm";
	}
	if (data === LIQUIDATE_CANCEL_CALLBACK) {
		return "cancel";
	}
	return undefined;
}
