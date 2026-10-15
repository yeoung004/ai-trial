# Council

A local, personal-use AI decision council. Five independent specialists handle **YES / NO** questions; three handle **Debate** questions. A selected **Final Judge** always makes the final call. The orchestration code controls rounds, retries, budgets, and stopping rules.

## Start

Requires Node.js 20.12 or newer.

```bash
npm install
cp .env.example .env
npm run dev
```

Set at least one provider key in `.env`, then open http://127.0.0.1:5173. Supported keys are `AI_GATEWAY_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GOOGLE_GENERATIVE_AI_API_KEY`. A Vercel `VERCEL_OIDC_TOKEN` also works for Gateway. Keys stay in the server process; the browser receives only booleans showing which providers are configured.

The app selects available models from its editable registry. The initial registry includes models from several providers. Model availability and pricing can change, so review the entries before using them. Configure the Role Generator, Default Expert, and Final Judge in the UI; individual experts can override the default. The Judge is required for every run.

For a local production build:

```bash
npm run build
npm start
```

The API defaults to `127.0.0.1:3001`; the dev UI runs on `127.0.0.1:5173`. Local data is written under the ignored `data/` directory. Set `COUNCIL_DATA_DIR` to use another directory. Do not expose the API on a public interface without adding authentication and request limits, since calls spend provider credits.

## How it runs

- **YES / NO:** validates a binary question, assigns five roles, calls the experts concurrently, then calls the Judge once. Four valid experts are enough if one fails after one retry.
- **Debate:** starts three experts independently, checks consensus in code, runs only useful targeted rebuttals, and stops after at most three rounds. If disagreement remains, experts score the other positions before the Judge decides. Two valid experts are enough in degraded mode.
- **Roles:** AUTO generates all roles, MANUAL preserves all user roles, and HYBRID generates only missing roles. A previewed lineup can be accepted without another role-generation call.
- **Cost controls:** output caps, optional maximum cost, and adaptive compute are configurable. If a maximum cost is set, every selected model needs pricing metadata; otherwise the server cannot enforce the cap. Cost is estimated from reported tokens and configured prices. The result indicates when the estimate is incomplete.
- **History:** completed runs, concise expert outputs, usage, and final judgments are saved as local JSON. Provider keys are never saved.

## Verification

```bash
npm test
npm run build
```

The tests use a mock model adapter for the required orchestration scenarios: exact expert counts, role modes, early consensus, deadlock stopping, cross evaluation, retries, Judge failure, budgets, model selection, usage, cancellation, and binary reframing.

An optional live evaluation harness compares a single premium model with the council on a small fixed set of questions and writes a report to `data/evals/`:

```bash
npx tsx src/server/evals/run.ts --judge gateway:gpt-5.6-sol --expert gateway:gpt-5.4-mini --role gateway:gpt-5.4-nano
```

This command makes paid model calls. Review its questions and model selections before running it. Use the report's empty human review fields to assess usefulness and correctness; automated answer matching alone does not establish answer quality.
