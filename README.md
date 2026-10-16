# AI Court

A private, local robot courtroom. Five independent experts answer YES / NO questions; three debate open questions for at most three rounds. A separately configured Judge always decides the outcome.

## Start

Requires Node.js 20.12 or newer.

```sh
npm install
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:5173. Choose models in **Settings → AI** (`/settings/ai`). The courtroom contains only question controls. Settings persist in this browser; completed councils and their usage persist in the ignored `data/` directory. `COUNCIL_DATA_DIR` changes that directory.

### Muse subscription (initial provider)

Install and browser-sign-in to the local Muse Code CLI. The official SDK is pinned to **1.4.9**; host startup, browser sign-in, and model discovery have been verified with CLI **1.4.10**. Set `MUSE_BIN` in the server environment if the binary is not on PATH. No API key is required for this provider.

Each inference gets its own SDK-owned host and fresh session in an empty temporary workspace. The `serve` command does not support `--preset empty`. Hosts instead disable shell execution, file writes, user-input tools, automatic workflows, artifact tools, web fetching, and web search using supported flags and configuration, and deny unmatched approvals; configurations containing hooks, MCP servers, or plugins are refused. The host is closed after success, failure, cancellation, or timeout. The adapter never invokes `muse exec`.

The subscription adapter verifies the effective browser-login credential lane through experimental `account/read`, then reads optional subscription usage from `usage/read`. A stored API key, unknown credential lane, unsupported account endpoint, or reported exhausted allowance stops execution. A fresh host may have no usage snapshot; this is displayed as usage unavailable without treating the account as disconnected. It never switches to a paid provider. Model discovery uses the session's `model/list`, restricted to the Meta route, rather than the public API catalog.

SDK 1.4.9 does not expose a hard output-token cap on `sendUserTurn`. Muse receives the concise schema and a requested output length; validated field limits and a three-minute turn deadline bound the workflow. API providers receive hard output-token limits. Missing token measurements are stored with `tokensKnown: false`, and unknown monetary pricing is not treated as a known zero.

Sources: [official SDK](https://github.com/meta-models/muse-code-sdk), [session model discovery](https://meta-models.github.io/muse-code-sdk/next/cookbook/list-models-and-switch-mid-session/), [credential state](https://meta-models.github.io/muse-code-sdk/next/generated/msp/types/accountstatekind/).

### Optional paid APIs

Configure only the providers you intend to select:

| Provider | Server environment |
| --- | --- |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google Gemini | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Meta Model API | `META_API_KEY` |
| OpenAI-compatible API | `COMPATIBLE_BASE_URL`, `COMPATIBLE_API_KEY` |
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` |

Credentials never enter browser settings. Role Generator, experts, Judge, and individual expert overrides may use different providers. A stage never silently changes its configured provider or model. The primary provider is shown first in model pickers; existing stage choices remain explicit.

Model discovery is cached for 15 minutes, connection status for one minute. **Refresh models** bypasses caches. Failed refreshes retain the previous catalog; cold failures use a small subset of the saved model registry, labeled fallback. Unknown Muse model names are never invented. Non-text models are hidden unless **Show all models** is selected.

## Architecture

- `src/lib/ai/core/`: provider contract, normalized descriptors, registry, cache manager.
- `src/lib/ai/providers/`: all provider SDKs, credentials, endpoints, Muse host/session/catalog/usage adapters.
- `src/server/engine/`: independent role generation, YES/NO, debate rounds, cross evaluation, Judge, execution, and budget modules.
- `src/server/engine/prompts/`: stage-specific prompts.
- `src/client/hooks/`: council, provider, settings, and navigation state.
- `src/client/bot/`: original local SVG body, face, outfits, hats, and props.
- `src/client/courtroom/`: event-driven visual state and scene composition.
- `src/client/settings/`: model choices, connection status, usage, appearance, and spending controls.

Round 1 experts never receive other expert outputs. Later rounds use compact structured positions. Backend consensus and repetition rules decide whether another round is useful. Cost controls reserve the mandatory Judge before optional rounds. A cost cap requires pricing metadata for every selected model; unknown prices fail validation. The saved registry can supply price overrides through `PUT /api/models`.

The local API binds to `127.0.0.1:3001`. For a production build, run `npm run build` then `npm start`. This single-user server has no authentication and is intended to remain local.

## Verification

```sh
npm test
npm run build
```

Tests cover council quorums, role modes, early termination, Judge failure, retries, cancellation, budgets, persistence, provider cache behavior, no paid failover, subscription billing guards, catalog route filtering, and character event mapping. Provider tests use deterministic mocks; they do not establish live credential availability.
