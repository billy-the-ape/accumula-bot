import { loadConfig } from "@/config/loadConfig";

export function loadTestConfig(
	env: Record<string, string | undefined> = process.env,
) {
	return loadConfig({
		// DEFAULTS FOR TESTING
		CLOUDAMQP_URL: "amqp://localhost",
		...env,
	});
}
