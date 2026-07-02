import { describe, expect, it, vi } from "vitest";
import { parseTelegramUpdate } from "@/notifications/telegram/bot/parseTelegramUpdate.js";
import {
	answerCallbackQuery,
	getTelegramUpdates,
	sendTelegramMessage,
	TelegramError,
} from "@/notifications/telegram/telegramClient.js";
import {
	acknowledgeCallbackQuery,
	runTelegramPoll,
	sendBotReply,
} from "@/notifications/telegram/telegramPolling.js";

function mockTelegramFetch(
	handlers: Record<
		string,
		(body: Record<string, unknown>) => unknown | Promise<unknown>
	>,
): typeof fetch {
	return vi.fn(async (url, init) => {
		const method = (url as string).split("/").pop() ?? "";
		const body = JSON.parse(init?.body as string) as Record<string, unknown>;
		const handler = handlers[method];
		if (!handler) {
			return new Response(
				JSON.stringify({ ok: false, description: "unknown" }),
				{
					status: 400,
				},
			);
		}

		const result = await handler(body);
		return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
	}) as typeof fetch;
}

describe("sendTelegramMessage", () => {
	it("posts text to the Telegram Bot API", async () => {
		const fetchImpl = mockTelegramFetch({
			sendMessage: (body) => {
				expect(body).toEqual({
					chat_id: "12345",
					text: "hello",
					parse_mode: "MarkdownV2",
					disable_web_page_preview: true,
				});
				return { message_id: 1 };
			},
		});

		await sendTelegramMessage(
			{ botToken: "bot-token", chatId: "12345", fetchImpl },
			"hello",
		);

		expect(fetchImpl).toHaveBeenCalledOnce();
		expect((vi.mocked(fetchImpl).mock.calls[0] as [string])[0]).toBe(
			"https://api.telegram.org/botbot-token/sendMessage",
		);
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

describe("getTelegramUpdates", () => {
	it("requests message and callback updates with offset and timeout", async () => {
		const fetchImpl = mockTelegramFetch({
			getUpdates: (body) => {
				expect(body).toEqual({
					offset: 42,
					timeout: 25,
					allowed_updates: ["message", "callback_query"],
				});
				return [{ update_id: 42, message: { chat: { id: 1 }, text: "hi" } }];
			},
		});

		const updates = await getTelegramUpdates({
			botToken: "bot-token",
			fetchImpl,
			offset: 42,
			timeoutSeconds: 25,
		});

		expect(updates).toHaveLength(1);
		expect(updates[0]?.update_id).toBe(42);
	});
});

describe("answerCallbackQuery", () => {
	it("acknowledges callback queries", async () => {
		const fetchImpl = mockTelegramFetch({
			answerCallbackQuery: (body) => {
				expect(body).toEqual({
					callback_query_id: "cb-1",
					text: "Saved",
				});
				return true;
			},
		});

		await answerCallbackQuery(
			{ botToken: "bot-token", fetchImpl },
			{ callbackQueryId: "cb-1", text: "Saved" },
		);
	});
});

describe("sendBotReply", () => {
	it("sends inline keyboard markup when provided", async () => {
		const fetchImpl = mockTelegramFetch({
			sendMessage: (body) => {
				expect(body.reply_markup).toEqual({
					inline_keyboard: [[{ text: "Low", callback_data: "risk:low" }]],
				});
				return { message_id: 2 };
			},
		});

		await sendBotReply({
			botToken: "bot-token",
			chatId: "999",
			text: "Choose risk",
			fetchImpl,
			replyMarkup: {
				inline_keyboard: [[{ text: "Low", callback_data: "risk:low" }]],
			},
		});
	});
});

describe("parseTelegramUpdate", () => {
	it("parses commands from messages", () => {
		expect(
			parseTelegramUpdate({
				update_id: 1,
				message: {
					text: "/start",
					chat: { id: 555 },
					from: {
						id: 42,
						is_bot: false,
						first_name: "Ada",
						username: "ada",
						language_code: "en",
					},
				},
			}),
		).toEqual({
			updateId: 1,
			chatId: "555",
			from: {
				id: "42",
				isBot: false,
				firstName: "Ada",
				lastName: null,
				username: "ada",
				languageCode: "en",
				isPremium: false,
			},
			incoming: { kind: "command", command: "start" },
		});
	});

	it("parses callback queries", () => {
		expect(
			parseTelegramUpdate({
				update_id: 2,
				callback_query: {
					id: "cb-9",
					data: "risk:high",
					from: {
						id: 99,
						is_bot: false,
						first_name: "Bob",
					},
					message: { chat: { id: 777 } },
				},
			}),
		).toEqual({
			updateId: 2,
			chatId: "777",
			callbackQueryId: "cb-9",
			from: {
				id: "99",
				isBot: false,
				firstName: "Bob",
				lastName: null,
				username: null,
				languageCode: null,
				isPremium: false,
			},
			incoming: { kind: "callback", data: "risk:high" },
		});
	});
});

describe("runTelegramPoll", () => {
	it("processes updates and advances offset", async () => {
		let pollCount = 0;
		const fetchImpl = mockTelegramFetch({
			getUpdates: (body) => {
				pollCount += 1;
				if (pollCount === 1) {
					expect(body.offset).toBeUndefined();
					return [
						{
							update_id: 10,
							message: { text: "/status", chat: { id: 1 } },
						},
					];
				}

				expect(body.offset).toBe(11);
				return [];
			},
		});

		const controller = new AbortController();
		const onUpdate = vi.fn(async () => {
			controller.abort();
		});

		await runTelegramPoll({
			botToken: "bot-token",
			fetchImpl,
			onUpdate,
			signal: controller.signal,
			pollTimeoutSeconds: 0,
		});

		expect(onUpdate).toHaveBeenCalledOnce();
		expect(pollCount).toBe(1);
	});

	it("exits immediately when already aborted", async () => {
		const fetchImpl = vi.fn();
		const controller = new AbortController();
		controller.abort();

		await runTelegramPoll({
			botToken: "bot-token",
			fetchImpl,
			onUpdate: vi.fn(),
			signal: controller.signal,
		});

		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("calls onError and continues after failures", async () => {
		let pollCount = 0;
		const controller = new AbortController();
		const fetchImpl = vi.fn(async () => {
			pollCount += 1;
			if (pollCount === 1) {
				throw new Error("network down");
			}

			controller.abort();
			return new Response(JSON.stringify({ ok: true, result: [] }), {
				status: 200,
			});
		});

		const onError = vi.fn();

		await runTelegramPoll({
			botToken: "bot-token",
			fetchImpl,
			onUpdate: vi.fn(),
			onError,
			signal: controller.signal,
			pollTimeoutSeconds: 0,
		});

		expect(onError).toHaveBeenCalledOnce();
		expect(pollCount).toBeGreaterThanOrEqual(2);
	});

	it("rethrows when onError is not provided", async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

		await expect(
			runTelegramPoll({
				botToken: "bot-token",
				fetchImpl,
				onUpdate: vi.fn(),
				pollTimeoutSeconds: 0,
			}),
		).rejects.toThrow("network down");
	});
});

describe("acknowledgeCallbackQuery", () => {
	it("delegates to answerCallbackQuery", async () => {
		const fetchImpl = mockTelegramFetch({
			answerCallbackQuery: () => true,
		});

		await acknowledgeCallbackQuery({
			botToken: "bot-token",
			callbackQueryId: "cb-2",
			fetchImpl,
		});

		expect(fetchImpl).toHaveBeenCalledOnce();
	});
});
