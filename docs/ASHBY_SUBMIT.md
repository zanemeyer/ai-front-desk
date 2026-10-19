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
1. Parent: ask “Are you open on Veterans Day?” — check source chip.
2. Parent: ask “Do you offer a sibling discount?” — see gap / fail-closed.
3. Admin → Needs attention → open sibling discount → quick answer → draft → publish → Test it.
4. Parent: re-ask sibling discount — now answered from the new entry.
```

3. Click **Submit Assignment**.

## Optional hardening (if you have 5 more minutes)
- In Vercel → Storage → create **Upstash Redis** and reconnect env vars so operator edits survive cold starts (currently uses in-memory seeded fallback).
- Rotate the Gemini API key after the process if it was shared in chat.
