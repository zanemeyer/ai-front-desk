# Sunny Hollow AI Front Desk — Exercise Notes

**Zane Meyer** · Staff AI Software Engineer, Product · brightwheel  
**Prototype:** https://ai-front-desk-eight-woad.vercel.app  
**Repo:** https://github.com/zanemeyer/ai-front-desk  
**Time spent:** ~3 hours

## Problem
Center admins answer the same questions all day while parents wait on voicemail. An AI Front Desk only helps if answers are **center-specific, citable, and honest about uncertainty** — and if operators can close knowledge gaps without a content-ops project.

## What I built
A mobile parent chat and an operator control center for a fictional center (**Sunny Hollow Early Learning Center**).

- **Parent:** ask by text (or voice in Chrome); get handbook-grounded answers with expandable source quotes, confidence, feedback, and a director handoff.
- **Operator:** dashboard of volume / auto-answer rate / gaps; inbox of questions the system struggled with; **Answer → draft entry → publish → re-test** loop; handbook editor; sensitive-topic settings.
- **Pipeline:** deterministic hard-block for unambiguous safety/legal/dispute cases → Gemini structured JSON over the full published handbook, which also judges gray-zone sensitivity against the operator’s topic list → **server-side citation verification** and yes/no polarity check → fail closed to “not in handbook” when grounding is weak → log every outcome.

Seed data covers the five prompt examples and deliberately leaves gaps (sibling discount, nap blankets, potty training, birthdays) so the improvement loop is demoable.

## Three design decisions
1. **Whole-handbook context, not vectors.** At ~15 policies, retrieval adds a failure mode without value. Grounding comes from **required, verified citations**, not from chunk search. Swap in retrieval at a few hundred entries.
2. **Fail closed beats a fluent guess.** Parents in early ed are anxious; a confident wrong answer is worse than a warm escalation. Low confidence / missing citations become gaps for staff, not invented policy.
3. **The inbox authors the handbook.** Unanswered questions are the backlog. Answering one *creates* a published entry. Knowledge grows from real parent demand.

## What I’d do next (out of timebox)
- Persist with Redis in production (Upstash wired; in-memory fallback for demos), staff SSO on `/admin`, SMS/brightwheel message channel, eval harness in CI, and per-center multi-tenant handbooks.

## Eval
`npm run eval` — 23 golden questions asserting outcome category (answered / gap / escalation) plus a few text checks (yes/no polarity, key facts). Includes false-positive guards so “Is the registration fee refundable?” is answered rather than escalated on the word “refund.” **Result: 23/23 passed.**
