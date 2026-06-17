import { describe, expect, it, vi } from "vitest";
import { loadTestConfig } from "@/config/loadTestConfig.js";
import { LlmError } from "@/llm/providers/types.js";
import { generateMacroBriefing } from "@/macro/generateMacroBriefing.js";
import { MACRO_BRIEFING_PROMPT_VERSION } from "@/macro/macroBriefingPrompt.js";

const sampleBriefing =
	"Risk-off tone ahead of CPI. Crypto correlates with equities. BTC ETF flows steady.";

function responsesApiResponse(content: string): Response {
	return new Response(
		JSON.stringify({
			output_text: content,
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		},
	);
}

describe("generateMacroBriefing", () => {
	it("calls OpenAI Responses web search and returns trimmed briefing content", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_PROVIDER: "openai_compatible",
			LLM_BASE_URL: "https://api.openai.com/v1",
			LLM_MODEL: "gpt-5.5",
			LLM_API_KEY: "test-key",
		});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(responsesApiResponse(`  ${sampleBriefing}  `));

		const result = await generateMacroBriefing(config, { fetchImpl });

		expect(result.content).toBe(sampleBriefing);
		expect(result.promptVersion).toBe(MACRO_BRIEFING_PROMPT_VERSION);
		expect(result.llm.provider).toBe("openai_compatible");
		expect(result.llm.model).toBe("gpt-5.5");
		expect(result.llm.rawResponse).toBe(sampleBriefing);
		expect(result.llm.attempt).toBe("initial");
		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(infoSpy).toHaveBeenCalledWith(
			expect.stringMatching(
				/Macro briefing: Running OpenAI Responses web search \(provider=openai_compatible, model=gpt-5.5, reasoning=high\)/,
			),
		);

		const [url, request] = fetchImpl.mock.calls[0] as [URL, RequestInit];
		expect(url.href).toBe("https://api.openai.com/v1/responses");
		const body = JSON.parse(request.body as string) as Record<string, unknown>;
		expect(body.instructions).toContain("Use web search");
		expect(body.input).toContain(
			"In 150 words or less, what is the current macro and narrative affecting BTC, ETH, SOL markets?",
		);
		expect(body.reasoning).toEqual({ effort: "high" });
		expect(body.tool_choice).toBe("required");
		expect(body.tools).toEqual([
			{ type: "web_search", search_context_size: "medium" },
		]);

		infoSpy.mockRestore();
	});

	it("retries once when the Responses API returns an empty response", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_PROVIDER: "openai_compatible",
			LLM_BASE_URL: "https://api.openai.com/v1",
			LLM_MODEL: "gpt-5.5",
			LLM_API_KEY: "test-key",
		});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(responsesApiResponse(""))
			.mockResolvedValueOnce(responsesApiResponse(sampleBriefing));

		const result = await generateMacroBriefing(config, { fetchImpl });

		expect(result.content).toBe(sampleBriefing);
		expect(result.llm.attempt).toBe("retry");
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(infoSpy).toHaveBeenCalledWith(
			"Macro briefing: OpenAI Responses returned an empty response; retrying once...",
		);

		infoSpy.mockRestore();
	});

	it("throws when trimmed content is still empty", async () => {
		const config = loadTestConfig({
			ASSET_TRADEABLE: "BTC,ETH,SOL,USDC",
			LLM_PROVIDER: "openai_compatible",
			LLM_BASE_URL: "https://api.openai.com/v1",
			LLM_MODEL: "gpt-5.5",
			LLM_API_KEY: "test-key",
		});
		vi.spyOn(console, "info").mockImplementation(() => {});
		const fetchImpl = vi.fn().mockResolvedValue(responsesApiResponse("   "));

		await expect(generateMacroBriefing(config, { fetchImpl })).rejects.toThrow(
			LlmError,
		);
	});
});
