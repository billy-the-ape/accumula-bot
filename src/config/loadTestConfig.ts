import { loadConfig } from "@/config/loadConfig";

// DEFAULTS FOR TESTING
const TEST_CONFIG_DEFAULT_ENV = {
	CLOUDAMQP_URL: "amqp://localhost",
	ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
	LLM_BASE_URL: "http://127.0.0.1:11434",
};

export function loadTestConfig(
	env: Record<string, string | undefined> = process.env,
) {
	return loadConfig({
		...TEST_CONFIG_DEFAULT_ENV,
		...env,
	});
}
