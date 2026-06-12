export type { AppConfig } from "@/config/appConfigSchema.js";
export {
	CRYPTOCURRENCY_REGISTRY,
	type CryptocurrencySymbol,
	getCryptocurrency,
	isKnownCryptocurrencySymbol,
} from "@/config/assets.js";
export { ConfigError, loadConfig } from "@/config/loadConfig.js";
