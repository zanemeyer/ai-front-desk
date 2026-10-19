# Sunny Hollow · AI Front Desk

Prototype for brightwheel’s hiring exercise: a grounded AI Front Desk for early education, with a parent chat and an operator control center.

## Quick start

```bash
cp .env.example .env.local
# set GEMINI_API_KEY
npm install
npm run dev
```

- Parent: [http://localhost:3000](http://localhost:3000)
- Operator: [http://localhost:3000/admin](http://localhost:3000/admin)

Optional persistence (survives cold starts on Vercel):

```bash
# from Vercel Marketplace → Upstash Redis, or:
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Without Upstash, the app uses an in-memory store seeded with handbook + sample question log.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local development |
| `npm run build` / `npm start` | Production |
| `npm run eval` | 15 golden questions (outcome categories) |

```bash
EVAL_BASE_URL=http://localhost:3000 npm run eval
```

## Architecture (short)

1. Sensitive-topic check → escalate with director contact  
2. Gemini (`gemini-2.5-flash`) answers from the **full published handbook** with structured JSON  
3. Server verifies `citedEntryIds` exist; low confidence / no citations → fail closed as a **gap**  
4. Gaps and escalations land in the operator inbox; answering drafts + publishes a handbook entry  

## Submission notes

See [docs/submission.md](docs/submission.md).
