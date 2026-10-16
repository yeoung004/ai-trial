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

### API providers

No provider or model is selected automatically. Without a configured provider, execution is blocked before inference.

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

Model discovery is cached for 15 minutes, connection status for one minute. **Refresh models** bypasses caches. Failed refreshes retain the previous catalog; cold failures use provider-owned catalogs, labeled fallback. Non-text models are hidden unless **Show all models** is selected.

## Architecture

- `src/lib/ai/core/`: provider contract, normalized descriptors, registry, cache manager.
- `src/lib/ai/providers/`: all provider SDKs, credentials, endpoints, and provider-owned fallback catalogs.
- `src/server/engine/`: independent role generation, YES/NO, debate rounds, cross evaluation, Judge, execution, and budget modules.
- `src/server/engine/prompts/`: stage-specific prompts.
- `src/client/hooks/`: council, provider, settings, and navigation state.
- `src/client/bot/`: original local SVG body, face, outfits, hats, and props.
- `src/client/courtroom/`: event-driven visual state and scene composition.
- `src/client/settings/`: model choices, connection status, appearance, and spending controls.

Round 1 experts never receive other expert outputs. Later rounds use compact structured positions. Backend consensus and repetition rules decide whether another round is useful. Cost controls reserve the mandatory Judge before optional rounds. A cost cap requires pricing metadata for every selected model; unknown prices fail validation. Without a cost cap, unknown pricing is stored as `null` and shown as “Cost unavailable”. The saved registry can supply price overrides through `PUT /api/models`.

The local API binds to `127.0.0.1:3001`. For a production build, run `npm run build` then `npm start`. This single-user server has no authentication and is intended to remain local.

## Verification

```sh
npm test
npm run lint
npm run build
```

Tests cover council quorums, role modes, early termination, Judge failure, retries, cancellation, budgets, persistence, provider cache behavior, no automatic provider failover, typed provider errors, settings validation, and character event mapping. Provider tests use deterministic mocks; they do not establish live credential availability.
