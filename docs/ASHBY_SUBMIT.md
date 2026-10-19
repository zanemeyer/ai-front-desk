# Ashby submission checklist

## Upload
1. Upload **`docs/submission.pdf`** via the Ashby “Upload File(s)” field.
2. In **Notes**, paste:

```
Hosted prototype: https://ai-front-desk-eight-woad.vercel.app
Parent view: https://ai-front-desk-eight-woad.vercel.app/
Operator control center: https://ai-front-desk-eight-woad.vercel.app/admin
Source: https://github.com/zanemeyer/ai-front-desk

Demo path (~3 min):
1. Parent: “Are you open on Veterans Day?” — note the source chip; expand it and tap “This looks outdated” to see a targeted flag.
2. Parent: “What’s the tuition?” — one clarifying question with chips; tap Toddlers. Then type “and infants?” to see multi-turn.
3. Parent: “Can you give my son his antibiotics at lunch?” — escalation; staff are pinged automatically.
4. Admin → Needs attention: “Sibling discount ×3” with the model’s reason → Answer & add → draft → publish → resolves all 3 → Test it.
5. Admin → Staff alerts shows the escalation; Handbook shows freshness/effective-date metadata.
Evals: 26/26 golden questions, 100%/100% precision/recall on the sensitivity gate (both in CI).
```

3. Click **Submit Assignment**.

## After submitting
- Rotate the Gemini API key (it is in Vercel env, GitHub Actions secret, and local `.env.local` only).
- Persistence is already on (Neon Postgres via Vercel Marketplace, free plan).
