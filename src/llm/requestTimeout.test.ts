import { describe, expect, it } from "vitest";
import {
	DEFAULT_LLM_REQUEST_TIMEOUT_MS,
	formatFetchErrorMessage,
} from "@/llm/requestTimeout.js";

describe("requestTimeout", () => {
	it("defaults to 30 minutes", () => {
		expect(DEFAULT_LLM_REQUEST_TIMEOUT_MS).toBe(1_800_000);
	});

	it("includes the underlying cause in fetch error messages", () => {
		const error = new TypeError("fetch failed", {
			cause: new Error("Headers Timeout Error"),
		});

		expect(formatFetchErrorMessage(error)).toBe(
			"fetch failed (Headers Timeout Error)",
		);
	});
});
