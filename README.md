# Accumula Bot

## Project Overview

This project is an experiment in building a largely autonomous cryptocurrency trading agent whose objective is **maximizing BTC-denominated returns**, not USD-denominated returns.

*The crypto BTC will be used in place of "Any Configured Crypto"

The purpose is not to create a high-frequency trading system or an unconstrained AI trader.

The goal is to build a system that can:

* Monitor crypto market conditions
* Evaluate BTC and selected alternative assets
* Generate trading recommendations
* Execute trades autonomously within strict guardrails
* Operate without requiring human intervention during nights, weekends, or periods of unavailability
* Measure success exclusively in terms of increasing BTC holdings

This project is intended to run on a self-hosted Ubuntu VPS with minimal operational costs and minimal third-party dependencies.

---

# Core Philosophy

The system should optimize for:

> Ending with more BTC than simply buying BTC today.

This is fundamentally different from maximizing USD gains.

Examples:

* If BTC gains 20% and a trade gains 10%, the trade failed.
* If BTC gains 5% and a trade gains 15%, the trade succeeded.
* If an altcoin position can later be converted into more BTC than before, it succeeded.

BTC accumulation is the benchmark.

---

# Non-Goals

The system is NOT intended to:

* Day trade
* High-frequency trade
* Use leverage
* Use perpetual futures
* Trade options
* Trade meme coins by default
* Chase short-term price action
* Make unrestricted AI decisions

---

# Hardware Environment

Current deployment target:

* Ubuntu VPS
* 8 CPU cores
* 32 GB RAM
* 400 GB disk
* No GPU

This environment is sufficient for:

* Ollama
* Qwen 3 8B
* Gemma 12B
* Llama 3.1 8B

This environment is NOT intended for:

* 70B models
* Multi-agent swarms
* Large-scale inference workloads

---

# AI Model

Current model:

```bash
ollama pull qwen3:8b
```

Served locally via Ollama.

The model should be treated as:

> An analyst and scoring engine

The model should NOT be treated as:

> The authority that controls funds

---

# Critical Design Principle

The AI never directly controls money.

Instead:

```text
Market Data (current price movement, scraped news)
     ↓
Node.js Application
     ↓
Prompt Construction
     ↓
Local LLM
     ↓
Trade Recommendation
     ↓
Risk Engine Validation
     ↓
Execution Engine
     ↓
Exchange
```

The risk engine always has final authority.

---

# Technology Stack

## Runtime

* Node.js
* TypeScript

## AI

* Ollama
* Qwen3:8b

## Validation

* Zod

## Storage

Initial:

* SQLite

Potential future migration:

* PostgreSQL

## Exchange Layer

Potential options:

* Hyperliquid
* Coinbase Advanced
* Kraken
* Binance (if legally available)

Use CCXT where possible.

## Scheduling

Initially:

* Cron

Potential future:

* Dedicated scheduler service

---

# Model Responsibilities

The model should:

* Analyze market data
* Rank assets
* Score opportunities
* Explain reasoning
* Produce structured JSON

The model should NOT:

* Access API keys
* Access wallets
* Place trades
* Override guardrails
* Modify risk parameters

---

# Approved Asset Universe

Initial whitelist:

```text
BTC
ETH
SOL
```

Potential future additions:

```text
LINK
AAVE
ONDO
INJ
```

No asset may be traded unless explicitly whitelisted.

---

# Risk Rules

These rules are enforced in code.

The AI cannot override them.

## No Leverage

Maximum leverage:

```text
1x only
```

## Spot Only

No:

* Perpetuals
* Options
* Margin

## Position Limits

Example:

```text
Maximum 25% allocation per asset
```

## Portfolio Limits

Example:

```text
Maximum 5 positions
```

## Daily Loss Protection

Example:

```text
If daily loss > 3%
Stop trading
```

## Weekly Loss Protection

Example:

```text
If weekly loss > 10%
Stop trading
```

## Kill Switch

Human operator can disable trading immediately.

---

# Required Output Format

All model responses should be valid JSON.

Example:

```json
{
  "rankings": [
    {
      "asset": "BTC",
      "score": 0.82
    },
    {
      "asset": "SOL",
      "score": 0.77
    }
  ],
  "recommended_asset": "BTC",
  "confidence": 0.74,
  "reason": "BTC currently exhibits the strongest relative performance and market structure."
}
```

No markdown.

No prose outside JSON.

---

# Initial Trading Strategy

Version 1:

BTC-relative rotation.

The system evaluates:

* BTC
* ETH
* SOL

The model determines which asset has the highest probability of outperforming BTC over the next 30 days.

Portfolio capital is allocated according to predefined rules.

Success metric:

```text
Portfolio BTC value after liquidation
```

NOT:

```text
USD value
```

---

# Initial Market Inputs

Version 1 should remain simple.

Inputs:

For each asset:

* Current price
* 24h change
* 7d change
* 30d change
* Volume trend
* Market cap

Do not add news or social data initially.

Build a working system first.

---

# Future Data Sources

Possible additions:

## Market Data

* CoinGecko
* CoinMarketCap

## Sentiment

* Reddit
* X/Twitter

## Macro

* ETF flows
* Fear & Greed Index

## On-chain

* Whale activity
* Stablecoin inflows

---

# Prompting Philosophy

The prompt should remain short and deterministic.

Example:

```text
You are a crypto portfolio analyst.

Objective:
Maximize BTC-denominated returns.

Rank the following assets.

Return valid JSON only.

<market data>
```

Avoid:

* Chain-of-thought requests
* Open-ended conversations
* Long system prompts

---

# Development Roadmap

## Phase 1

LLM integration.

Tasks:

* Connect Node.js to Ollama
* Generate structured JSON
* Validate using Zod
* Log results

No trading.

No APIs.

No money.

---

## Phase 2

Market data ingestion.

Tasks:

* Fetch prices
* Build prompt
* Generate rankings
* Store decisions

Still no trading.

---

## Phase 3

Paper trading.

Tasks:

* Simulated portfolio
* Position tracking
* PnL tracking
* BTC-relative performance tracking

Run for multiple weeks.

---

## Phase 4

Live trading.

Tasks:

* Small capital allocation
* Exchange API integration
* Trading-only API keys
* Withdrawals disabled

---

## Phase 5

Advanced Signals

Potential additions:

* Sentiment analysis
* Narrative detection
* On-chain analytics
* Event-driven trading

Only after earlier phases demonstrate value.

---

# Success Criteria

The project succeeds if:

1. The system operates autonomously.
2. The system remains within risk constraints.
3. The system survives long enough to collect meaningful data.
4. The system outperforms simple BTC accumulation in BTC-denominated terms.

The primary benchmark is:

```text
Would buying BTC on day one have produced more BTC than this strategy?
```

If the answer is yes, the strategy failed.

If the answer is no, the strategy succeeded.
