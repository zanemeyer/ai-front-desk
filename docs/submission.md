# Sunny Hollow AI Front Desk — Exercise Notes

**Zane Meyer** · Staff AI Software Engineer, Product · brightwheel  
**Prototype:** https://ai-front-desk-eight-woad.vercel.app · **Operator:** /admin  
**Repo:** https://github.com/zanemeyer/ai-front-desk · **Time:** ~3 h core build + a follow-up pass on persistence, evals, and the improvement loop

## Problem
Admins answer the same questions all day while parents wait on voicemail. An AI Front Desk only helps if answers are **center-specific, citable, and honest about uncertainty**, and if operators can close gaps without a content-ops project.

## What I built
A mobile parent chat (web + SMS webhook) and an operator control center for a fictional center, **Sunny Hollow Early Learning Center**.

- **Parent:** text or voice, multi-turn (“what about toddlers?”). Answers cite handbook entries with expandable quotes, confidence, and a freshness caveat when a weekly-changing entry (lunch menu) is overdue. Ambiguous questions (“what’s the tuition?”) get **one clarifying question with tappable chips**. Parents can flag a specific source as **“this looks outdated.”**
- **Sensitive handoff:** deterministic hard-blocks for safety/legal/dispute cases plus a dedicated classifier run in parallel with generation. Escalations **ping staff automatically** and tell the parent so (“I’ve pinged Maya with your message”).
- **Operator:** hours saved and auto-answer rate; a **Needs-attention inbox clustered by intent** (three sibling-discount questions = one card, ×3) showing *why* each failed: model reason, rejected citation IDs, prompt version. **Answer → draft → publish → re-test** resolves the whole cluster. Handbook editor with effective-date windows and review cadence; staff alerts; sensitive-situation settings.
- **Persistence:** Postgres (Neon) so edits and the question log survive cold starts; seed data is versioned, the log is never overwritten.

## Three design decisions
1. **Whole-handbook context, not vectors.** At ~15 policies retrieval adds a failure mode without value. Grounding comes from required, server-verified citations; unknown IDs are rejected and surfaced to staff. Swap in retrieval at a few hundred entries.
2. **Fail closed, but ask before failing.** A confident wrong answer is worse than a warm escalation; a clarifying question beats both. Low confidence or missing citations become gaps, not invented policy. Yes/no polarity is checked server-side (the first build said “Yes, we are closed on Veterans Day”).
3. **The inbox authors the handbook.** Unanswered questions, clustered by intent, are the backlog. Answering one publishes an entry and resolves the cluster. Knowledge grows from real parent demand.

## Evaluation
- `npm run eval`: **26 golden questions** asserting outcome (answered / clarify / gap / escalation), key facts, yes/no polarity, one multi-turn case, and false-positive guards (“Is the registration fee refundable?” must be *answered*, not escalated on “refund”). **26/26.**
- `npm run eval:sensitive`: **30 labeled messages**, precision/recall of the “needs a human” gate. **100%/100%** (v1 was 88% precision; the misses were the canonical fever question and refund policy, fixed by rewriting the topic descriptions). Recall is the floor that matters.
- Both run in **GitHub Actions on every push** with a 10-minute budget. Every answer carries a `promptVersion`, so a regression traces to a prompt change.

## Next
Staff SSO on `/admin`; Twilio signature validation and a real staff channel (brightwheel message/push); embedding-based intent dedup; multi-tenant handbooks; retrieval once the handbook outgrows the context window.
