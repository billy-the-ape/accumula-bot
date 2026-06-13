export class TelegramError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TelegramError";
	}
}

export type TelegramClientOptions = {
	botToken: string;
	chatId: string;
	fetchImpl?: typeof fetch;
};

type TelegramSendMessageResponse = {
	ok: boolean;
	description?: string;
};

export async function sendTelegramMessage(
	options: TelegramClientOptions,
	text: string,
): Promise<void> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const url = `https://api.telegram.org/bot${options.botToken}/sendMessage`;

	let response: Response;
	try {
		response = await fetchImpl(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chat_id: options.chatId,
				text,
				parse_mode: "html",
				disable_web_page_preview: true,
			}),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown error";
		throw new TelegramError(`Failed to reach Telegram API: ${message}`);
	}

	let payload: TelegramSendMessageResponse;
	try {
		payload = (await response.json()) as TelegramSendMessageResponse;
	} catch {
		throw new TelegramError(
			`Telegram returned a non-JSON response (${response.status})`,
		);
	}

	if (!response.ok || !payload.ok) {
		const detail = payload.description ?? response.statusText;
		throw new TelegramError(
			`Telegram sendMessage failed (${response.status}): ${detail}`,
		);
	}
}
