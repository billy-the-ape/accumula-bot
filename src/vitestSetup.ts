import { vi } from "vitest";

vi.mock("@/sources/social_media/twitterClient/amqpProducer", () => ({
	sendAndConsumeAmqp: vi.fn().mockResolvedValue({
		success: true,
		message: undefined,
		data: {
			results: [],
		},
	}),
}));
