export class TelegramError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TelegramError";
	}
}

export type TelegramApiOptions = {
	botToken: string;
	fetchImpl?: typeof fetch;
};

/** @deprecated Use SendBotReplyOptions for multi-user bots. Kept for notifyRun. */
export type TelegramClientOptions = TelegramApiOptions & {
	chatId: string;
};

type TelegramApiResponse<T> = {
	ok: boolean;
	description?: string;
	result?: T;
};

export type TelegramUpdate = {
	update_id: number;
	message?: {
		text?: string;
		chat: { id: number };
	};
	callback_query?: {
		id: string;
		data?: string;
		message?: {
			chat: { id: number };
		};
	};
};

export async function callTelegramApi<T>(
	options: TelegramApiOptions,
	method: string,
	body: Record<string, unknown>,
): Promise<T> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const url = `https://api.telegram.org/bot${options.botToken}/${method}`;

	let response: Response;
	try {
		response = await fetchImpl(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown error";
		throw new TelegramError(`Failed to reach Telegram API: ${message}`);
	}

	let payload: TelegramApiResponse<T>;
	try {
		payload = (await response.json()) as TelegramApiResponse<T>;
	} catch {
		throw new TelegramError(
			`Telegram returned a non-JSON response (${response.status})`,
		);
	}

	if (!response.ok || !payload.ok) {
		const detail = payload.description ?? response.statusText;
		throw new TelegramError(
			`Telegram ${method} failed (${response.status}): ${detail}`,
		);
	}

	if (payload.result === undefined) {
		throw new TelegramError(`Telegram ${method} returned no result`);
	}

	return payload.result;
}

export async function sendTelegramMessage(
	options: TelegramClientOptions,
	text: string,
): Promise<void> {
	await callTelegramApi(options, "sendMessage", {
		chat_id: options.chatId,
		text,
		parse_mode: "MarkdownV2",
		disable_web_page_preview: true,
	});
}

export async function answerCallbackQuery(
	options: TelegramApiOptions,
	params: { callbackQueryId: string; text?: string },
): Promise<void> {
	await callTelegramApi<boolean>(options, "answerCallbackQuery", {
		callback_query_id: params.callbackQueryId,
		...(params.text ? { text: params.text } : {}),
	});
}

export async function getTelegramUpdates(
	options: TelegramApiOptions & {
		offset?: number;
		timeoutSeconds?: number;
	},
): Promise<TelegramUpdate[]> {
	return callTelegramApi<TelegramUpdate[]>(options, "getUpdates", {
		...(options.offset !== undefined ? { offset: options.offset } : {}),
		timeout: options.timeoutSeconds ?? 0,
		allowed_updates: ["message", "callback_query"],
	});
}
