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
Data Sources (market data, prediction markets, sentiment, news)
     ↓
Normalization per source (compact, trust-tagged context blocks — no pre-baked verdicts)
     ↓
Node.js Application
     ↓
Prompt Construction (assembled context)
     ↓
Local LLM (infers the signal from the data)
     ↓
Trade Recommendation
     ↓
Risk Engine Validation
     ↓
Execution Engine
     ↓
Exchange
```

The risk engine always has final authority. See [Multi-Source Context Strategy](#multi-source-context-strategy) for how raw data from many sources is fed to the model safely.

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

Optional Telegram: see [Notifications](#notifications) for the multi-user bot (`TELEGRAM_BOT_TOKEN`) and optional admin mirror (`TELEGRAM_CHAT_ID`).

After pulling updates that add multi-user support, run `pnpm db:migrate` once — see [Upgrading from a single-user install](#upgrading-from-a-single-user-install).

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Run with file watch |
| `pnpm start` | Run once (LLM once → paper execution for each active user portfolio) |
| `pnpm telegram:bot` | Long-running Telegram bot (onboarding + `/status` / `/summary` / `/reset`) |
| `pnpm telegram:daily-summary` | Send daily portfolio summary to each active user (requires `TELEGRAM_BOT_TOKEN`) |
| `pnpm macro:briefing` | Generate daily macro briefing via OpenAI web search (uses `.env.macro`) |
| `pnpm db:migrate` | Apply SQLite schema migrations |
| `pnpm db:cleanup-legacy` | Preview/remove legacy portfolio rows (keeps tweets + macro); see flags below |
| `pnpm test` | Run tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm type-check` | TypeScript check |
| `pnpm lint` | Biome lint + format check |
| `pnpm format` | Auto-fix lint and format |
| `pnpm check` | Lint, type-check, and test (local CI) |

## Scheduling (3× daily)

The bot is designed as a **one-shot process**: `pnpm start` runs a single cycle (market data → optional social-media analysis → **one** portfolio-outlook LLM call → **paper execution for every active user portfolio** → exit). Each onboarded Telegram user has their own paper portfolio and **risk tolerance** (which adjusts the minimum confidence required before a trade executes). When `SOCIAL_MEDIA_ENABLED=true`, each run performs **many LLM calls** on the trading model (batched relevance filter + synthesis digest, then trade recommendation) using `.env` / Ollama — see [Social Media](#social-media) for call counts. A **separate daily job** (`pnpm macro:briefing`, `.env.macro` / OpenAI) writes macro context to the DB for Stage 1 — see [Macro Briefing](#macro-briefing). Schedule trading **three times per day** (or hourly via PM2) so decisions can accumulate without keeping a Node process running 24/7.

The **interactive Telegram bot** (`pnpm telegram:bot` or PM2 `accumula-bot-telegram`) runs separately as a long-lived process for `/start` onboarding and portfolio commands — see [Telegram bot (multi-user)](#telegram-bot-multi-user).

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
4. **Database migrated** (`pnpm db:migrate`) — required after schema updates.
5. **Log directory** (optional but recommended):

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

[PM2](https://pm2.keymetrics.io/) can trigger the bot and Telegram daily summary on a cron schedule using the repo's `ecosystem.config.cjs`.

Install PM2 globally if needed:

```bash
npm install -g pm2
```

From the repo root:

```bash
mkdir logs
pnpm install   # node_modules/.bin/tsx must exist
pm2 start ecosystem.config.cjs
pm2 save
```

`ecosystem.config.cjs` defines **three** apps:

| PM2 name | Schedule (local time) | What it runs | Env file | Restarts |
|----------|----------------------|--------------|----------|----------|
| `accumula-bot` | Every hour (`0 * * * *`) | Main trading cycle (`src/index.ts`) | `.env` (Ollama) | One-shot per cron tick |
| `accumula-bot-macro-briefing` | Daily (`0 14 * * *`) | Macro briefing + daily Telegram briefing per user | `.env.macro` (OpenAI + Telegram) | One-shot per cron tick |
| `accumula-bot-telegram` | Always on | Interactive Telegram bot (`botCli.ts`) | `.env` | `autorestart: true` |

Trading runs use **local Ollama** from `.env`. The macro job uses **OpenAI Responses API + web search** from `.env.macro` and writes to the same SQLite DB (`DATABASE_PATH`). Hourly runs read the latest briefing when social media is enabled — see [Macro Briefing](#macro-briefing).

Start all three after deploy:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

Or start individually: `pm2 start ecosystem.config.cjs --only accumula-bot-telegram`.

PM2 invokes `node_modules/.bin/tsx` with `interpreter: "bash"` (do not set `script: "pnpm"` — PM2 runs scripts with Node by default and will fail on the pnpm shell wrapper).

Useful commands:

```bash
pm2 status                        # next cron run shown when time: true
pm2 logs accumula-bot             # main bot stdout/stderr
pm2 logs accumula-bot-macro-briefing   # macro briefing stdout/stderr
pm2 logs accumula-bot-telegram    # interactive bot stdout/stderr
pm2 stop accumula-bot             # disable scheduled trading runs
pm2 delete accumula-bot accumula-bot-macro-briefing accumula-bot-telegram
pm2 startup                       # generate OS startup hook (Linux)
```

Each app uses `autorestart: false` so each cron tick starts a **fresh one-shot run** (same as manual `pnpm start`). Cron times use the **server local timezone**.

Keep **Ollama** running separately (e.g. `pm2 start ollama` or systemd). Telegram requires **`TELEGRAM_BOT_TOKEN`** in `.env` for notifications and the interactive bot — see [Notifications](#notifications).

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
│   ├── notifications/     # Telegram bot, DMs (per-user run reports + daily summary)
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

## Prediction Markets — **implemented** (off by default)

* Polymarket (Gamma public API for discovery + bulk prices, no auth)
* Kalshi (`trade-api/v2` public market data, no auth)

Read-only — directional scores from implied price distributions used as a **signal** that informs the 24h direction score. The bot does **not** trade on these markets. See [Prediction Markets](#prediction-markets) for config and how the score is derived.

## Sentiment — **implemented** (Twitter/X, off by default)

* X/Twitter via search AMQP (`CLOUDAMQP_URL`)

Read-only — a **batched relevance filter + synthesis** pipeline filters raw posts in small LLM batches, then feeds a compact digest (not the full post dump) into the portfolio-outlook prompt. See [Social Media](#social-media) for config and output shape.

## Sentiment (future)

* Reddit

## Macro — **implemented** (daily briefing + Stage 1 scene-setting)

* Daily macro/narrative briefing stored in SQLite (`macro_briefings` table)
* OpenAI Responses API with web search (separate `.env.macro` from trading Ollama)
* Injected into Stage 1 social analysis when fresh (≤36h) — see [Macro Briefing](#macro-briefing)

## On-chain

* Whale activity
* Stablecoin inflows

---

# Multi-Source Context Strategy

The long-term plan is to feed the model **many data sources** (market data, prediction markets, social sentiment, news/events) and let it **infer the signal itself**, rather than pre-computing verdicts like "prediction markets say BTC up". The system gives the model rich context and trusts it to reason — the deterministic risk engine, not the model, controls money.

## Normalize, don't editorialize

There is a deliberate distinction between two things:

| | What it means | Policy |
|---|---|---|
| **Interpretation / aggregation** | Computing the conclusion *for* the model | **Avoid** — let the model reason over the data |
| **Normalization / sanitization / budgeting** | Cleaning, structuring, trust-tagging, and size-capping data before the prompt | **Keep** — this is hygiene, not editorializing |

Slogan: **don't pre-chew the conclusion, but do wash the vegetables.**

Each source is an `AnalysisDataSource` (`src/analysis/sources/`) that emits an `AnalysisSection`:

* `promptText` — a compact, normalized block the model sees (not a raw API dump)
* `payload` — the raw data, retained for storage and audit

New sources slot in via `DEFAULT_ANALYSIS_DATA_SOURCES` without changing the prompt or decision logic.

## Why raw, unmassaged dumps are unsafe

1. **Prompt injection** — social/news text is untrusted; a crafted post could act as an instruction to a bot that moves money. Structured market/prediction APIs are lower risk; free text is the threat surface.
2. **Context truncation** — local `qwen3:8b` via Ollama defaults to a small `num_ctx`; large raw dumps get silently truncated, so the model quietly ignores data.
3. **Small-model limits** — 8B models are weak at arithmetic and dense-JSON parsing; compute numeric facts and let the model do qualitative synthesis.
4. **Auditability** — "the model read 40 KB of raw data and decided" is undebuggable.

## Guardrails (most → least important)

1. **Deterministic risk layer keeps final authority** — whitelist, per-asset allocation caps, kill switch, and loss limits bound the outcome no matter what the model infers. The LLM is advisory only.
2. **Schema-constrained output** — Zod validation rejects malformed decisions before execution, regardless of how messy the input was.
3. **Trust boundaries for untrusted sources** — social/news content is wrapped in clearly delimited, tagged blocks and treated as *data to analyze, never instructions to follow*; markup is stripped. **Social media implements this today:** Stage 1a filters raw posts in small batches inside a trust boundary; Stage 1b synthesizes the relevant subset; the portfolio-outlook prompt (Stage 2) sees only the structured digest (plus full text for the top three ranked posts), still wrapped as untrusted-derived data.
4. **Per-source token budget** — each section's size is capped and logged so silent truncation is caught; `num_ctx` is set deliberately.
5. **Provenance, freshness, and audit** — every datum carries its source and `as_of` timestamp, and the full context `payload` is persisted with each decision for replay.
6. **Graceful per-source degradation** — a failing or junk source is tagged "unavailable" rather than poisoning or blocking the run; the model is told when a source is missing so absence is not mistaken for a signal.
7. **Compute numbers where math matters** — implied probabilities, percentage changes, and spot-vs-strike are provided as numbers, not inferred from raw payloads.
8. **Model capacity** — as sources grow, a larger-context model (the supported Anthropic provider) may replace the 8B local model, which is the bottleneck on context size and reasoning.

---

# Prediction Markets

A read-only data source (`src/sources/prediction_markets/`, surfaced via `predictionMarketSource` in `DEFAULT_ANALYSIS_DATA_SOURCES`) that adds a **directional score** per asset to the LLM context from [Kalshi](https://kalshi.com) and [Polymarket](https://polymarket.com). The score is stored in `impliedUpProbability` (historical field name) but represents a normalized bullish/bearish read in `[0,1]` with **0.5 = neutral**, not a literal P(up). The bot does **not** trade on these markets — it is signal only, and the deterministic risk engine still has final authority.

**Off by default.** Set `PREDICTION_MARKETS_ENABLED=true` to include the section.

## Implied-distribution scoring

Both venues list **"≥ strike" threshold ladders** (e.g. *"Will Bitcoin be above $66,000 on June 16?"*), not direct up/down markets. Each rung is a cumulative probability `P(price > strike)`. Reading a single rung pins near 1¢/99¢ when spot sits just off a coarse strike — useless as a direction signal.

Instead, for each asset the source (`src/sources/prediction_markets/impliedDistribution.ts`):

1. Fetches the live **spot price** (CoinGecko — uses `COINGECKO_BASE_URL`). **Spot is required**; without it the venue emits no signal.
2. Selects the expiry nearest the target horizon (`PREDICTION_MARKETS_HORIZON_HOURS`), then takes up to **6 rungs closest to spot** (above and below) that pass a liquidity floor.
3. Converts the ladder into bucket masses: `P(price ∈ [Xᵢ, Xᵢ₊₁]) ≈ P(>Xᵢ) − P(>Xᵢ₊₁)` (negative masses from bid/ask noise are clamped to 0).
4. Finds the **mode bucket** — the interval with the highest mass (the market's most likely landing zone).
5. Maps the mode bucket's **midpoint** vs spot to a directional score: `(modeMidpoint − spot) / spot` linearly scaled so **±5%** maps to **0.0 / 1.0**, clamped, with **0.5 at spot**.

Requires at least **3 rungs** with usable strikes and probabilities; otherwise no signal. Kalshi prices come from YES bid/ask midpoints; Polymarket uses bulk Gamma `outcomePrices` (one API call per event, no per-rung CLOB calls).

The LLM prompt and Telegram report include the score plus optional debug fields when available: mode strike, spot, and mode-bucket probability (`directional_score`, `mode_strike_usd`, `spot_usd`, `mode_bucket_probability`).

Discovery: Kalshi daily series (`KXBTCD` / `KXETHD` / `KXSOLD`); Polymarket via Gamma `/events` (tag `crypto`, ordered by 24h volume) matching the daily ladder title `"<Asset> above ___ on <date>?"`. Assets without a mapping (`marketMap.ts`) — or venues that return no open market — are reported as *"no signal available"* rather than blocking the run.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PREDICTION_MARKETS_ENABLED` | No | `false` | Set `true`/`1` to add the prediction-market section |
| `PREDICTION_MARKETS_HORIZON_HOURS` | No | `24` | Target signal horizon used for expiry selection |
| `PREDICTION_MARKETS_NORMALIZATION_BAND_PCT` | No | `0.05` | Spot-relative band (±5%) mapped to score 0.0 / 1.0 |
| `PREDICTION_MARKETS_MAX_RUNGS` | No | `6` | Max ladder rungs nearest spot used to build the distribution |
| `PREDICTION_MARKETS_MIN_RUNGS` | No | `3` | Minimum rungs required to emit a signal |
| `PREDICTION_MARKETS_MIN_RUNG_LIQUIDITY_USD` | No | `1000` | Liquidity floor per rung (USD); falls back to all usable rungs if too few clear it |
| `KALSHI_BASE_URL` | No | `https://external-api.kalshi.com/trade-api/v2` | Kalshi public market-data base URL |
| `POLYMARKET_GAMMA_BASE_URL` | No | `https://gamma-api.polymarket.com` | Polymarket Gamma (discovery + bulk prices) base URL |
| `POLYMARKET_CLOB_BASE_URL` | No | `https://clob.polymarket.com` | Retained in config; scoring uses Gamma bulk prices, not CLOB midpoints |

---

# Macro Briefing

A **daily** job (`src/macro/`, `pnpm macro:briefing`) asks an OpenAI model with **web search** for the current macro backdrop affecting crypto markets (~200 words). The result is saved to SQLite and reused by hourly trading runs as **scene-setting context** in Stage 1 social media analysis — not as a separate portfolio-outlook section.

This separates fast-changing world context (Fed meetings, CPI prints, geopolitical headlines) from static prompt structure. Trading runs stay on **local Ollama** (`.env`); the macro job uses **OpenAI** (`.env.macro`).

## Dual env setup

| File | Used by | LLM |
|------|---------|-----|
| `.env` | `pnpm start`, PM2 `accumula-bot` | Ollama (default) |
| `.env.macro` | `pnpm macro:briefing`, PM2 `accumula-bot-macro-briefing` | OpenAI Responses API + web search |

Setup:

```bash
cp .env .env.macro
# Edit .env.macro: set LLM_PROVIDER=openai_compatible, LLM_BASE_URL, LLM_MODEL, LLM_API_KEY
# Keep DATABASE_PATH the same as .env so briefings land in the trading DB
```

See `.env.macro.example` for the required shape. **Never commit `.env.macro`** (gitignored).

The macro generator calls `POST /v1/responses` with `tools: [{ type: "web_search" }]`, `tool_choice: "required"`, and `reasoning: { effort: "high" }`. It requires `LLM_BASE_URL=https://api.openai.com/v1` and `LLM_API_KEY`.

## Staleness and Stage 1 injection

Each hourly run loads the latest row from `macro_briefings`. It is injected into the Stage 1 prompt only if **`createdAt` is ≤36 hours old** (`MACRO_BRIEFING_MAX_AGE_MS` in code). Otherwise the social prompt runs unchanged (no preamble).

When injected, the briefing appears **before** relevance guidance (Stage 1a batch filter) and synthesis instructions (Stage 1b) as trusted desk context. Raw tweets remain untrusted; if a post contradicts the briefing with a concrete new fact, the prompt tells the model to prefer the post.

Console logs during social fetch:

* `Social media: using macro briefing from 2026-06-16T07:00:00.000Z` — fresh briefing loaded
* `Social media: no fresh macro briefing available; Stage 1 runs without market context` — missing or stale

Manual run:

```bash
pnpm macro:briefing
# Macro briefing saved (id=1, createdAt=..., promptVersion=v2, ...)
# Daily briefing sent to N user(s): ...
```

When `TELEGRAM_BOT_TOKEN` is set in `.env.macro`, the job sends a **Daily Briefing** Telegram message to **each active user portfolio** (macro text + that user's portfolio summary). Optionally set `TELEGRAM_CHAT_ID` to mirror copies to an admin chat. If Telegram is not configured, the briefing is still saved to the DB.

Run `pnpm db:migrate` once on deploy so the `macro_briefings` table exists.

## PM2 schedule

`accumula-bot-macro-briefing` in `ecosystem.config.cjs` runs daily (default **14:00 local**). Schedule it **before** your first trading run of the day so Stage 1 has fresh context.

## Environment variables (`.env.macro`)

Same `loadConfig()` requirements as `.env` (assets, `DATABASE_PATH`, `CLOUDAMQP_URL`, etc.). Only the **LLM block** differs — point at OpenAI, not Ollama:

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `LLM_PROVIDER` | Yes | `openai_compatible` | Must be `openai_compatible` for web search |
| `LLM_BASE_URL` | Yes | `https://api.openai.com/v1` | Official OpenAI API only |
| `LLM_MODEL` | Yes | `gpt-5.5` | Model supporting Responses API + web search |
| `LLM_API_KEY` | Yes | `sk-...` | OpenAI API key |
| `DATABASE_PATH` | Yes | `data/accumula.db` | **Same path as `.env`** — briefings must be readable by trading runs |
| `TELEGRAM_BOT_TOKEN` | For daily DM | — | Sends Daily Briefing to each active user |
| `TELEGRAM_CHAT_ID` | No | — | Optional admin mirror for daily briefing copies |

---

# Social Media

A read-only data source (`src/sources/social_media/`, surfaced via `socialMediaSource` in `DEFAULT_ANALYSIS_DATA_SOURCES`) that collects Twitter/X posts via AMQP search and adds a **structured social digest** to the portfolio-outlook LLM context. The bot does **not** post or trade on social signals — they inform the 24h direction score only.

**Off by default.** Set `SOCIAL_MEDIA_ENABLED=true` to enable the source.

## Batched relevance + synthesis pipeline

Each run with social media enabled performs **multiple LLM calls** on the **trading** LLM (`.env` — typically Ollama), then one portfolio-outlook call:

1. **Stage 1a — batched relevance filter** (`findRelevantSocialMediaSignals`) — Up to **500 newest posts** are split into **20-post batches** and scanned **sequentially**. Each batch prompt includes the optional macro briefing preamble (see [Macro Briefing](#macro-briefing)) and returns `{ relevant_post_ids: [...] }`. Failed batch parses degrade to 0 relevant for that batch rather than failing the run.
2. **Stage 1b — synthesis** (`analyzeSocialMedia` → `synthesizeRelevantSocialMediaSignals`) — Runs only when Stage 1a finds ≥1 relevant post. The **pre-filtered subset** is synthesized into structured `SocialMediaAnalysis` JSON (themes, per-asset sentiment, ranked `top_posts`). `relevant_count` is computed server-side from the filter — the synthesis model does not re-count relevance. Macro briefing preamble is included again.
3. **Stage 2 — `runAnalysis`** — The portfolio-outlook prompt receives a **compact digest** (`formatSocialMediaAnalysis`) instead of every post. The digest includes full text for the **top three** ranked posts for grounding. The section is still wrapped as untrusted-derived data.

**LLM call count (worst case):** `ceil(min(fetch, 500) / 20)` batch calls + 1 synthesis call + 1 portfolio call. Example: 201 posts → **11 + 1 + 1 = 13** trading-LLM calls.

If Stage 1b fails (parse error after retry), the run **continues**: the social section falls back to raw post formatting and the Telegram report shows `Analysis unavailable`. Trading is never blocked on social analysis failure.

When zero posts are retrieved, all social LLM calls are skipped. When posts are retrieved but none pass the relevance bar, only the batch filter runs — synthesis is skipped.

## Console and Telegram output

After building the analysis context, the run logs:

* `Social media: using macro briefing from …` or `no fresh macro briefing available` (when social enabled)
* `Social media: relevance filter — N batches × 20 posts (sequential)` and per-batch `batch X/Y — R relevant of 20`
* `Social media: relevance filter done — R relevant of S scanned in Xms`
* `Social media: running synthesis on R relevant posts …` (when R > 0)
* `Social media analysis completed in Xms (filter=Yms, synthesize=Zms, relevant=R/T)`
* `Social media: retrieved=N relevant=M` (and themes when present)
* Or `Social media: retrieved=N (analysis unavailable)` on fallback
* Or `Social media: no posts retrieved`

The per-run Telegram report (see [Notifications](#notifications)) includes the same structured social block when Stage 1 succeeded: retrieved/relevant counts, themes, top signals, and per-asset sentiment notes.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOCIAL_MEDIA_ENABLED` | No | `false` | Set `true`/`1` to enable Twitter collection + batched social analysis |
| `CLOUDAMQP_URL` | Yes (when enabled) | — | AMQP URL for the Twitter search worker |
| `TWITTER_SEARCH_STRING` | Yes (when enabled) | — | Search query passed to the Twitter worker |
| `TWITTER_SEARCH_MAX_PAGES` | No | `5` | Max result pages to scrape per run |

---

# Notifications

Optional [Telegram](https://telegram.org/) integration lives in `src/notifications/telegram/`.

The bot supports **multi-user paper portfolios**: each Telegram user who `/start`s the bot gets their own portfolio in SQLite. Hourly trading runs the LLM **once**, then executes paper trades and sends run reports **per active user**, using each user's **risk tolerance** to set the minimum confidence bar for trades.

Notifications are **off by default**. Set `TELEGRAM_BOT_TOKEN` to enable the interactive bot and per-user DMs.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes (for Telegram) | Bot token from [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | No | Optional **admin mirror** — copies each user's run report and daily summary here (useful for the operator). Requires `TELEGRAM_BOT_TOKEN`. |

`TELEGRAM_BOT_TOKEN` alone is enough for onboarded users to receive messages at their own chat id. If `TELEGRAM_CHAT_ID` is set and differs from a user's chat id, that user still gets their report and the admin chat gets a copy.

Add to `.env`:

```bash
TELEGRAM_BOT_TOKEN=123456789:AA...
# Optional operator mirror:
TELEGRAM_CHAT_ID=987654321
```

## Telegram bot (multi-user)

Run the long-polling bot so users can onboard and check portfolios:

```bash
pnpm telegram:bot
# or PM2: accumula-bot-telegram (autorestart: true in ecosystem.config.cjs)
```

### Commands

| Command | Behavior |
|---------|----------|
| `/start` | New user: onboarding (starting USD value → risk tolerance). Existing user: portfolio summary **plus** hint about `/reset`. |
| `/status` | Portfolio snapshot (holdings, returns, risk tolerance, effective min confidence). |
| `/summary` | Same as `/status`. |
| `/reset` | Deactivate current portfolio and restart onboarding. |

**Onboarding flow:**

1. **Starting value** — tap **Default** ($10,000) or send a custom USD amount.
2. **Risk tolerance** — inline keyboard: Low / Medium / High.

Each user may have **one active portfolio** at a time. Historical portfolios remain in the DB after `/reset`.

### Risk tolerance → trade confidence

Risk tolerance adjusts only the **minimum confidence** required before a trade executes (global buy/sell direction thresholds stay the same):

| Risk | Min confidence to trade |
|------|-------------------------|
| Low | 0.74 |
| Medium | 0.67 |
| High | 0.60 |

## Quick setup (5 minutes)

### 1. Create a bot and get the token

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the prompts (name + username ending in `bot`).
3. BotFather replies with a token like `123456789:AAH...` — that is `TELEGRAM_BOT_TOKEN`.

### 2. Start the interactive bot

```bash
pnpm db:migrate          # once, if not already done
pnpm telegram:bot        # or: pm2 start ecosystem.config.cjs --only accumula-bot-telegram
```

### 3. Onboard via Telegram

1. Open your bot in Telegram and send `/start`.
2. Complete starting value and risk tolerance.
3. Send `/status` to confirm holdings and returns.

### 4. Get your chat ID (optional — for admin mirror)

If you want run reports copied to a fixed operator chat, replace `<TOKEN>` with your bot token:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates"
```

In the JSON, find `"chat":{"id":987654321` — that number is `TELEGRAM_CHAT_ID`. For a personal DM, the ID is a positive integer.

### 5. Test notifications

```bash
pnpm telegram:daily-summary   # daily summary to each active user
pnpm start                    # hourly run report after LLM + execution
```

If no users have completed `/start`, hourly runs still save LLM decisions but log `No active portfolios — execution skipped` and send no Telegram messages.

## What gets sent

### Run report (hourly / `pnpm start`)

Sent to **each active user's chat** on every completed run (executed, risk-blocked, or hold). Includes:

* Derived actions and per-asset outlooks (direction score, confidence, reason)
* **Effective min confidence** for that user's risk tolerance
* **Social media** — retrieved/relevant counts, themes, top signals, per-asset sentiment (when Stage 1 succeeded)
* Prediction-market directional scores (when enabled)
* Trades (if any), execution status, portfolio summary in accumulate-asset terms

When `TELEGRAM_CHAT_ID` is set, the same report is mirrored to the admin chat (unless the user *is* that chat).

### Daily briefing

Sent to **each active user** after `pnpm macro:briefing` (PM2 `accumula-bot-macro-briefing`) when `TELEGRAM_BOT_TOKEN` is set in `.env.macro`. Also available manually via `pnpm telegram:daily-summary` (uses `.env`; includes the latest saved macro text from the DB when present). Includes:

* **Full macro briefing text** (when generated / stored)
* **BTC-denominated** returns for 24h, 7d, and all-time (the bot's primary benchmark — not USD PnL)
* Trade count in the last 24h
* Current holdings
* Starting and current portfolio value in BTC and USD

**Note:** USD value can rise while BTC return is negative if BTC price moved up but the strategy holds less BTC than the starting baseline. The percentage lines measure performance in **BTC terms**, matching the project's success criteria.

## Scheduling notifications

| Method | Command / config |
|--------|------------------|
| Hourly run reports | PM2 `accumula-bot` or cron `pnpm start` |
| Interactive bot | PM2 `accumula-bot-telegram` or `pnpm telegram:bot` |
| Daily briefing | PM2 `accumula-bot-macro-briefing` or `pnpm macro:briefing` |
| Manual daily summary | `pnpm telegram:daily-summary` |

## Upgrading from a single-user install

Older versions used a **singleton portfolio** (auto-created on first hourly run) and sent all Telegram messages to one `TELEGRAM_CHAT_ID`.

After upgrading:

1. **Migrate the database:**

   ```bash
   pnpm db:migrate
   ```

   This adds `telegram_users` and links portfolios to Telegram users (`0007_dark_nextwave.sql`).

2. **Legacy portfolio rows** (no `telegram_user_id`) remain in the DB for history but are **not executed** on hourly runs. To remove them without touching tweets or macro data:

   ```bash
   cp data/accumula.db data/accumula.db.bak   # backup first
   pnpm db:cleanup-legacy                     # dry run — shows counts
   pnpm db:cleanup-legacy -- --yes            # delete orphan portfolios, trades, positions
   ```

   To wipe **all** portfolio and Telegram user rows (fresh `/start` for everyone; still keeps `decisions`, `social_media_posts`, `macro_briefings`):

   ```bash
   pnpm db:cleanup-legacy -- --all --yes
   ```

3. **Each person who wants a portfolio** must message the bot and complete `/start` (including the operator — set `TELEGRAM_CHAT_ID` only if you want an admin mirror in addition to your own user chat).

4. **Start the Telegram bot process** (`pnpm telegram:bot` or PM2 `accumula-bot-telegram`) — hourly cron alone does not handle `/start`.

5. **`TELEGRAM_CHAT_ID` is now optional.** Keep it if you want operator copies; remove it if you only need per-user delivery via the bot token.

## Verification checklist

Use this after deploy or upgrade:

- [ ] `pnpm db:migrate` applied without errors
- [ ] `pnpm check` green
- [ ] `TELEGRAM_BOT_TOKEN` set in `.env`
- [ ] `pnpm telegram:bot` running (or PM2 `accumula-bot-telegram` online)
- [ ] `/start` → onboarding → portfolio created; `/status` shows holdings
- [ ] `pnpm start` with at least one active user → run report received in Telegram
- [ ] Optional: `TELEGRAM_CHAT_ID` set → admin receives mirrored copy
- [ ] `pnpm telegram:daily-summary` → each active user receives summary
- [ ] Zero active users: `pnpm start` completes, logs `No active portfolios — execution skipped`

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

* Prediction-market signals (Polymarket, Kalshi) — **implemented**, see [Prediction Markets](#prediction-markets)
* Twitter/X social sentiment — **implemented**, see [Social Media](#social-media)
* Reddit / additional sentiment sources
* Narrative detection
* On-chain analytics
* Event-driven trading

Added as normalized `AnalysisDataSource` modules under `src/analysis/sources/` (off by default), only after earlier phases demonstrate value.

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
