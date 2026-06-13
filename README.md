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

Three trading cycles per day (08:00, 14:00, 20:00 server local time). Each run executes one full cycle via `pnpm start` and exits; portfolio state persists in SQLite.

See [Scheduling (3× daily)](#scheduling-3-daily) under Development for cron, Windows Task Scheduler, and PM2 setup.

Potential future:

* In-process scheduler (`src/scheduler/`) with overlap locks

---

# Development

## Prerequisites

* Node.js 22+ (see `.node-version`)
* [pnpm](https://pnpm.io/) 10+
* [Ollama](https://ollama.com/) (Phase 1+)

## Setup

```bash
pnpm install
cp .env.example .env   # Windows: copy .env.example .env
```

Edit `.env` as needed. Secrets stay local; never commit `.env`.

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Run with file watch |
| `pnpm start` | Run once |
| `pnpm test` | Run tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm type-check` | TypeScript check |
| `pnpm lint` | Biome lint + format check |
| `pnpm format` | Auto-fix lint and format |
| `pnpm check` | Lint, type-check, and test (local CI) |

## Scheduling (3× daily)

The bot is designed as a **one-shot process**: `pnpm start` runs a single cycle (market data → LLM → paper execution → exit). Schedule it **three times per day** so decisions can accumulate without keeping a Node process running 24/7.

Default schedule (server **local timezone**):

| Run | Time |
|-----|------|
| 1 | 08:00 |
| 2 | 14:00 |
| 3 | 20:00 |

Adjust times to match your VPS timezone and how often you want fresh rankings. Three runs per day is a reasonable default for a ~30-day LLM horizon without hammering CoinGecko or Ollama.

### Prerequisites

1. **Ollama must be running** before each cycle (`LLM_BASE_URL` in `.env`, default `http://127.0.0.1:11434`). The bot does not start Ollama for you.
2. **`.env` configured** in the project root (`cp .env.example .env`).
3. **Dependencies installed** (`pnpm install`).
4. **Log directory** (optional but recommended):

```bash
mkdir logs
```

### Linux / Ubuntu (cron)

Edit the crontab for the user that owns the repo:

```bash
crontab -e
```

Add (replace `/path/to/accumula-bot` with the absolute path to this repo):

```cron
0 8,14,20 * * * cd /path/to/accumula-bot && pnpm start >> logs/cron.log 2>&1
```

If `pnpm` is not on cron's PATH, use the full path from `which pnpm`.

Verify after the next scheduled time:

```bash
tail -f logs/cron.log
```

### Windows (Task Scheduler)

Create **one task** with **three daily triggers** (or three separate tasks — either works).

1. Open **Task Scheduler** → **Create Task**.
2. **General:** name `Accumula Bot`, run whether user is logged on or not, run with highest privileges if needed so `.env` and `data/` are reachable.
3. **Triggers:** New trigger → Daily → repeat or add three triggers at **8:00 AM**, **2:00 PM**, **8:00 PM**.
4. **Actions:** Start a program
   - **Program:** `pnpm` (or full path, e.g. `C:\Users\you\AppData\Roaming\npm\pnpm.cmd`)
   - **Arguments:** `start`
   - **Start in:** `C:\source\accumula-bot` (your repo path)
5. **Settings:** allow task to run on demand; stop if runs longer than 1 hour (runs usually finish in a few minutes).

Test manually: **Run** the task, then check console output or redirect to a log file in the action if desired.

### PM2 (cron restart)

[PM2](https://pm2.keymetrics.io/) can trigger `pnpm start` on the same 3× daily schedule using the repo's `ecosystem.config.cjs`.

Install PM2 globally if needed:

```bash
npm install -g pm2
```

From the repo root:

```bash
mkdir logs
pm2 start ecosystem.config.cjs
pm2 save
```

Useful commands:

```bash
pm2 status              # next cron run shown when time: true
pm2 logs accumula-bot   # stdout/stderr from scheduled runs
pm2 stop accumula-bot   # disable scheduled runs
pm2 delete accumula-bot
pm2 startup             # generate OS startup hook (Linux)
```

The PM2 app uses `autorestart: false` so each cron tick starts a **fresh one-shot cycle** (same as manual `pnpm start`). Cron times use the **server local timezone**.

Keep **Ollama** running separately (e.g. `pm2 start ollama` or systemd) — only the bot cycle is defined in `ecosystem.config.cjs`.

### Overlap and failures

If a run takes longer than the interval between schedules, a second run could start concurrently. For paper v1 this is unlikely (~1–2 minutes per run). If it becomes an issue, add a lock file or move to an in-process scheduler with a mutex.

If a run fails (LLM down, CoinGecko error), the next scheduled run will try again; state is preserved in `data/accumula.db`.

## Tooling

* **Runtime:** [tsx](https://github.com/privatenumber/tsx) executes TypeScript directly (no `dist/` build yet)
* **Tests:** Vitest; co-located as `src/**/*.test.ts`
* **Lint/format:** Biome
* **Modules:** ESM (`"type": "module"`); relative imports use `.js` extensions under `"module": "nodenext"`

---

# Project Structure

Application code lives under `src/`. Tooling config stays at the repo root. Runtime data (SQLite, local state) goes in `data/` (gitignored).

```text
accumula-bot/
├── src/
│   ├── index.ts           # Thin bootstrap: load config, start scheduler
│   ├── config/            # Env + app settings (Zod-validated)
│   ├── domain/            # Pure logic: BTC benchmark, whitelist, position math
│   ├── market/            # Phase 2+: price/market data fetch + normalize
│   ├── llm/               # Phase 1+: Ollama client, prompts, JSON parse
│   ├── risk/              # Guardrails — always runs before execution
│   ├── execution/         # Phase 3+: paper trader; Phase 4+: live trader
│   ├── exchange/          # Phase 4+: CCXT adapter behind an interface
│   ├── storage/           # Phase 2+: SQLite repos, migrations
│   └── scheduler/         # Cron job definitions
├── data/                  # Runtime SQLite and local state (not committed)
├── scripts/               # Optional: operator tools (kill switch, DB maintenance)
├── .env.example           # Documented env vars (no secrets)
└── vitest.config.ts
```

Folders are added as each roadmap phase starts — do not create empty modules ahead of need.

## Module boundaries

These rules mirror the [Critical Design Principle](#critical-design-principle) pipeline:

| Rule | Rationale |
|------|-----------|
| `domain/` has no I/O | BTC-relative PnL, allocation rules, and whitelist checks stay pure and easy to test |
| `llm/` never calls `exchange/` or `execution/` | The model is an analyst, not an executor |
| `risk/` sits between recommendation and execution | Only validated recommendations reach the execution engine |
| `execution/` depends on `risk/`, not the reverse | The risk engine keeps final authority |
| Config is loaded once via Zod in `config/` | Single source of truth; `.env` only for secrets and URLs |
| Zod schemas define external shapes | LLM JSON, market payloads, and DB rows — infer TypeScript types from schemas |
| Paper and live share an interface | `PaperExecution` (Phase 3) and `LiveExecution` (Phase 4) implement the same contract |
| No secrets in `src/` | API keys and URLs come from `.env` → `config/` only |

## Phase → folder mapping

| Phase | Folders introduced or extended |
|-------|-------------------------------|
| **1** — LLM integration | `config/`, `llm/` |
| **2** — Market data | `market/`, `storage/` |
| **3** — Paper trading | `execution/` (paper) |
| **4** — Live trading | `exchange/`, `execution/` (live) |
| **5** — Advanced signals | New modules under `market/` or a dedicated `signals/` folder |

## Tests

* Place tests next to the code they cover: `src/**/*.test.ts`
* Favor heavy coverage in `domain/` and `risk/`; mock I/O at module boundaries
* Run `pnpm test` or `pnpm check` before committing

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
AVAX
MATIC
ONDO
INJ
XLM
TON
LTC
SUI
XAUt
XRP
TRON
HYPE
XMR
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

Example (rotate into best volatile):

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

Example (defensive cash — sell volatiles into `ASSET_STARTING`):

```json
{
  "rankings": [
    { "asset": "BTC", "score": 0.45 },
    { "asset": "ETH", "score": 0.38 },
    { "asset": "SOL", "score": 0.32 }
  ],
  "recommended_asset": "USDC",
  "confidence": 0.68,
  "reason": "Broad weakness and negative momentum; preserve capital in cash until conditions improve."
}
```

Rules:

* `rankings` — volatile assets only (e.g. BTC, ETH, SOL); comparative scores vs the accumulation benchmark.
* `recommended_asset` — any whitelisted tradeable asset, including the configured cash/stable asset (`ASSET_STARTING`, e.g. USDC) for risk-off, or a volatile for rotation.

No markdown.

No prose outside JSON.

---

# Initial Trading Strategy

Version 1:

BTC-relative rotation with optional defensive cash.

The system evaluates volatile assets:

* BTC
* ETH
* SOL

The model ranks volatiles by their probability of outperforming the accumulation asset (`ASSET_TO_ACCUMULATE`, default BTC) over the next 30 days.

**Rotation (risk-on):** `recommended_asset` is the best volatile (or BTC when it is the strongest relative hold).

**Defensive cash (risk-off):** `recommended_asset` may be the configured starting/cash asset (`ASSET_STARTING`, e.g. USDC) when the model expects a downturn or continuing weakness. Execution sells volatile holdings into cash; the model does not rank stables in `rankings`.

Success is still measured in BTC terms after liquidation — USDC preserves USD value and may underperform BTC if BTC rallies. The prompt should prefer BTC over cash when BTC is the strongest relative hold.

Portfolio capital is allocated according to predefined rules and risk guardrails.

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

# Notifications

* Send Telegram message when trades occur
* Send Daily summary of profit/loss, trades, etc for the last 24h, profit/loss for the last week, and all time.

---

# Prompting Philosophy

The prompt should remain short and deterministic.

Example:

```text
You are a crypto portfolio analyst.

Objective:
Maximize BTC-denominated returns.

Rank volatile assets by likelihood of outperforming BTC over 30 days.

You may set recommended_asset to a volatile (rotate) or to USDC (defensive cash)
when preserving capital outweighs rotation.

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
