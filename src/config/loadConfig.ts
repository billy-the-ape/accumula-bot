import type { AppConfig } from "@/config/appConfigSchema.js";
import { AppConfigSchema } from "@/config/appConfigSchema.js";
import { RawEnvSchema } from "@/config/envSchema.js";

export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigError";
	}
}

export function loadConfig(
	env: Record<string, string | undefined> = process.env,
): AppConfig {
	const parsedEnv = RawEnvSchema.safeParse(env);
	if (!parsedEnv.success) {
		throw new ConfigError(formatZodError(parsedEnv.error));
	}

	const config = AppConfigSchema.safeParse(parsedEnv.data);
	if (!config.success) {
		throw new ConfigError(formatZodError(config.error));
	}

	return config.data;
}

function formatZodError(error: {
	issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.length > 0 ? issue.path.join(".") : "config";
			return `${path}: ${issue.message}`;
		})
		.join("; ");
}
