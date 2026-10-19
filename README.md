# Sunny Hollow · AI Front Desk

Prototype for brightwheel’s hiring exercise: a grounded AI Front Desk for early education, with a parent chat (web + SMS) and an operator control center whose inbox authors the handbook.

- Parent: https://ai-front-desk-eight-woad.vercel.app
- Operator: https://ai-front-desk-eight-woad.vercel.app/admin
- Write-up: [docs/submission.md](docs/submission.md)

## Quick start

```bash
cp .env.example .env.local   # set GEMINI_API_KEY
npm install
npm run dev
```

Without a database the app uses an in-memory store seeded with the handbook and a sample question log. For persistence set one of:

```bash
DATABASE_URL=postgres://...            # Neon / any Postgres (one afd_kv table, auto-created)
UPSTASH_REDIS_REST_URL= / _TOKEN=      # or Upstash Redis
```

Optional: `RESEND_API_KEY` (+ `NOTIFY_FROM`) to email the director on escalations; otherwise alerts are shown in the control center only.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | App |
| `npm run eval` | 26 golden questions: outcome category, key facts, yes/no polarity, multi-turn (`EVAL_BASE_URL`, `EVAL_MAX_CASES`, `EVAL_TIMEOUT_MS`) |
| `npm run eval:sensitive` | Precision / recall of the “needs a human” gate on 30 labeled messages (`MIN_RECALL`, `MIN_PRECISION`) |
| `npm run purge:test` | Remove `admin-test` traffic (eval runs, “Test it”) from the persistent log |

Both evals run in CI ([.github/workflows/eval.yml](.github/workflows/eval.yml)) on every push, with a 10-minute budget.

## How an answer is produced

1. **Hard blocks** — word-boundary rules for unambiguous cases (abuse, custody/court orders, lawsuits, disputes, staff complaints, “my child got hurt… what happened”). No model call.
2. In parallel: a **sensitivity classifier** (guided by the operator’s list of situations that need a human) and **grounded generation** over the full published, in-effect handbook with the last few turns of conversation.
3. Classifier says sensitive → **escalate**: staff are notified, the parent is told who was pinged.
4. Model asks for clarification → **clarify** with tappable options.
5. Server **verifies citations** (unknown IDs rejected and logged), **verifies the model's verbatim supporting quote** against the cited entry (quote-then-answer: the schema makes the model copy the source sentence before it writes the answer; an unverifiable quote downgrades confidence and is shown to staff), checks **yes/no polarity**, adds **freshness caveats** for overdue entries. Low confidence or no valid citation → **gap**, fail closed.
6. Every outcome is logged with intent, reason, confidence, rejected citations, and prompt version.

## Operator loop

Gaps, escalations, thumbs-downs, and parent “this looks outdated” flags land in **Needs attention**, clustered by intent. “Answer & add” → the model drafts a handbook entry from the staff answer (and the other phrasings in the cluster) → edit → publish → every question in the cluster is resolved → re-test.

## SMS

Point a Twilio number’s inbound webhook at `POST /api/sms`. It accepts the Twilio form shape (`Body`, `From`) and replies with TwiML; clarification options are rendered as “Reply with one of: …”. Signature validation is not implemented in this prototype.

## Layout

```
src/lib/ask.ts        pipeline (hard blocks, parallel classify+answer, verification, caveats, logging)
src/lib/gemini.ts     prompts + structured output schemas, PROMPT_VERSION / CLASSIFIER_VERSION
src/lib/store.ts      KV store: Postgres | Upstash | memory, versioned seeding
src/lib/stats.ts      hours saved, intent clustering
src/lib/notify.ts     staff notification (log, optional email)
src/components/       ParentChat, AdminApp
scripts/              eval.ts, eval-sensitive.ts, purge-test-traffic.ts
```
