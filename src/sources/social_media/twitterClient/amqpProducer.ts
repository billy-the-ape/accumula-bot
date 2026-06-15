import crypto from "node:crypto";
import EventEmitter from "node:events";
import amqp from "amqplib/callback_api";
import { loadConfig } from "@/config";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const noop = () => {};

const REPLY_QUEUE = "amq.rabbitmq.reply-to";
const TIMEOUT_LENGTH = 1000 * 60 * 2; // Two minutes
type ReplyToChannel = amqp.Channel & {
	responseEmitter: EventEmitter;
};

const DEV_LOG_PREFIX = "[AMQP Producer] ";

let _cachedChannel: ReplyToChannel | null = null;
let shuttingDown = false;

const setupChannelQueue = (queueName: string): Promise<ReplyToChannel> =>
	new Promise<ReplyToChannel>((resolve, reject) => {
		const config = loadConfig();
		const CLOUDAMQP_URL = config.socialMedia.twitterConfig.cloudamqpUrl;

		if (_cachedChannel) {
			_cachedChannel.assertQueue(queueName, undefined, (err) => {
				if (err) {
					reject(err);
					return;
				}
				if (!_cachedChannel) {
					reject(new Error("Channel was closed"));
					return;
				}
				resolve(_cachedChannel);
			});
		} else {
			amqp.connect(CLOUDAMQP_URL, (error0, connection) => {
				if (error0) {
					reject(error0);
					return;
				}
				connection.createChannel((error1, channel) => {
					if (error1) {
						reject(error1);
						return;
					}

					const replyChannel = channel as ReplyToChannel;

					replyChannel.responseEmitter = new EventEmitter();
					replyChannel.responseEmitter.setMaxListeners(0);
					channel.consume(
						REPLY_QUEUE,
						(msg) => {
							if (msg) {
								replyChannel.responseEmitter.emit(
									msg.properties.correlationId,
									JSON.parse(msg.content.toString()),
								);
							}
						},
						{ noAck: true },
					);

					replyChannel.assertQueue(queueName);

					_cachedChannel = replyChannel;

					resolve(replyChannel);
				});

				connection.on("close", () => {
					console.warn(
						`${DEV_LOG_PREFIX} WARNING Connection closed, resetting cached channel`,
					);
					_cachedChannel = null;
					if (!shuttingDown) {
						return setupChannelQueue(queueName);
					}
					return null;
				});

				connection.on("error", (e) => {
					console.error(`${DEV_LOG_PREFIX} ERRORRabbitMQ connection error:`, e);
					_cachedChannel = null;
					if (!shuttingDown) {
						return setupChannelQueue(queueName);
					}
					return null;
				});
			});
		}
	});

export const sendAndConsumeAmqp = <
	TResponse extends { success: boolean; message?: string },
	TMessage extends { type: string; noReply?: boolean; timeout?: number } = {
		type: string;
		noReply?: boolean;
		timeout?: number;
	} & Record<string, any>,
>({
	type,
	noReply,
	timeout = TIMEOUT_LENGTH,
	...message
}: TMessage) =>
	new Promise<TResponse>(async (resolve) => {
		const correlationId = crypto.randomUUID();
		const channel = await setupChannelQueue(type);
		let responseReceived = false;

		if (!noReply) {
			channel.responseEmitter.once(correlationId, (arg) => {
				responseReceived = true;
				return resolve(arg);
			});
		}

		channel.sendToQueue(
			type,
			Buffer.from(
				JSON.stringify(
					{
						...message,
						noReply,
						type,
					},
					(_, value) => (typeof value === "bigint" ? value.toString() : value),
				),
			),
			...(noReply
				? []
				: [
						{
							correlationId,
							replyTo: REPLY_QUEUE,
						},
					]),
		);

		if (noReply) {
			sleep(100).then(() => resolve({ success: true } as TResponse));
		} else {
			sleep(timeout).then(() => {
				if (responseReceived) {
					return;
				}
				console.info(`${DEV_LOG_PREFIX}Timed out | type=${type}`);
				return resolve({
					success: false,
					message: "amqp_timeout",
				} as TResponse);
			});
		}
	});

process.on("SIGTERM", () => {
	shuttingDown = true;
	if (_cachedChannel) {
		_cachedChannel.close(noop);
		_cachedChannel = null;
	}
	process.exit(0);
});

process.on("SIGINT", () => {
	shuttingDown = true;
	if (_cachedChannel) {
		_cachedChannel.close(noop);
		_cachedChannel = null;
	}
	process.exit(0);
});
