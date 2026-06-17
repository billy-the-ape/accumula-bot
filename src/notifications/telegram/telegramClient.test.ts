import { describe, expect, it, vi } from "vitest";

import {
	sendTelegramMessage,
	TelegramError,
} from "@/notifications/telegram/telegramClient.js";

describe("sendTelegramMessage", () => {
	it("posts text to the Telegram Bot API", async () => {
		const fetchImpl = vi

			.fn()

			.mockResolvedValue(
				new Response(JSON.stringify({ ok: true }), { status: 200 }),
			);

		await sendTelegramMessage(
			{
				botToken: "bot-token",

				chatId: "12345",

				fetchImpl,
			},

			"hello",
		);

		expect(fetchImpl).toHaveBeenCalledOnce();

		const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];

		expect(url).toBe("https://api.telegram.org/botbot-token/sendMessage");

		expect(init.method).toBe("POST");

		expect(JSON.parse(init.body as string)).toEqual({
			chat_id: "12345",

			text: "hello",

			parse_mode: "MarkdownV2",

			disable_web_page_preview: true,
		});
	});

	it("throws TelegramError when the API reports failure", async () => {
		const fetchImpl = vi

			.fn()

			.mockResolvedValue(
				new Response(
					JSON.stringify({ ok: false, description: "chat not found" }),

					{ status: 400 },
				),
			);

		await expect(
			sendTelegramMessage(
				{ botToken: "bot-token", chatId: "bad-id", fetchImpl },

				"hello",
			),
		).rejects.toThrow(TelegramError);
	});
});
