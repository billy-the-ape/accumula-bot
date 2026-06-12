import type { MarketSnapshot } from "@/schemas/MarketSnapshot.js";
import type { StoredTrade } from "@/schemas/Trade.js";
import type { TradeRecommendation } from "@/schemas/TradeRecommendation.js";

export type ExecuteRecommendationInput = {
	recommendation: TradeRecommendation;
	marketSnapshots: readonly MarketSnapshot[];
	decisionId?: number;
};

export type ExecutionResult = {
	executed: boolean;
	reason: string;
	trades: StoredTrade[];
	riskBlocked?: boolean;
};

export interface ExecutionEngine {
	executeRecommendation(
		input: ExecuteRecommendationInput,
	): Promise<ExecutionResult>;
}
