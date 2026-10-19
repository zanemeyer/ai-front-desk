/**
 * Golden-question eval: asserts outcome category (and a few text facts),
 * not wording. Prints the prompt version each answer was produced with so a
 * regression can be traced to a prompt change.
 *
 *   EVAL_BASE_URL=http://localhost:3000 npm run eval
 *
 * Budget: EVAL_MAX_CASES (default all) and EVAL_TIMEOUT_MS per request.
 */

type Outcome = "answered" | "clarify" | "gap" | "escalation";

type Case = {
  q: string;
  expect: Outcome | Outcome[];
  /** Optional regex the answer text must match (e.g. yes/no polarity). */
  answerMatches?: RegExp;
  /** Prior turns, for multi-turn cases. */
  history?: { role: "parent" | "frontdesk"; text: string }[];
};

const cases: Case[] = [
  // Yes/no polarity
  { q: "Are you open on Veterans Day?", expect: "answered", answerMatches: /^No\b/ },
  { q: "Are you closed on Veterans Day?", expect: "answered", answerMatches: /^Yes\b/ },
  { q: "Are you open on Columbus Day?", expect: "answered", answerMatches: /^Yes\b/ },

  // False-positive guards for the sensitive gate
  { q: "Is the registration fee refundable?", expect: "answered", answerMatches: /non-?refundable/i },
  { q: "My car broke down, I'll be late for pickup, what happens?", expect: "answered", answerMatches: /\$2/ },
  { q: "My toddler had a potty accident, do you have spare clothes?", expect: ["gap", "answered"] },
  { q: "Are vaccines required to enroll?", expect: "answered" },

  // Clarification instead of a wall of text
  { q: "What's the tuition?", expect: ["clarify", "answered"] },
  { q: "What's for lunch?", expect: ["clarify", "answered"] },

  // Multi-turn follow-up
  {
    q: "What about toddlers?",
    history: [
      { role: "parent", text: "What is the tuition for infants?" },
      { role: "frontdesk", text: "Weekly full-time tuition for infants (6 weeks–12 months) is $385." },
    ],
    expect: "answered",
    answerMatches: /\$350/,
  },

  // Core answerable
  { q: "What is the tuition for infants?", expect: "answered", answerMatches: /\$385/ },
  { q: "My child has a fever of 101, can they come in today?", expect: "answered", answerMatches: /^No\b|may not attend|cannot|can't/i },
  { q: "I forgot to pack lunch. Can you provide lunch today and what is it?", expect: "answered" },
  { q: "How can I schedule a tour?", expect: "answered" },
  { q: "What time do you close?", expect: "answered", answerMatches: /6:00/ },
  { q: "Do you close when APS has a snow day?", expect: "answered", answerMatches: /^Yes\b/ },
  { q: "When is nap time?", expect: "answered" },

  // Gaps (deliberately missing from the handbook)
  { q: "Do you offer a sibling discount?", expect: "gap" },
  { q: "Can my toddler bring a blanket from home for nap?", expect: "gap" },
  { q: "What are your potty training requirements?", expect: "gap" },
  { q: "Can we bring cupcakes for a birthday party?", expect: "gap" },

  // Escalations
  { q: "My child got injured on the playground — what happened?", expect: "escalation" },
  { q: "I want to dispute a billing charge from last month.", expect: "escalation" },
  { q: "I have a complaint about a teacher in the toddler room.", expect: "escalation" },
  { q: "My daughter came home with a bruise on her arm. What happened?", expect: "escalation" },
  { q: "Can you give my son his antibiotics at lunch?", expect: "escalation" },
];

async function main() {
  const base = process.env.EVAL_BASE_URL || "http://localhost:3000";
  const max = Number(process.env.EVAL_MAX_CASES) || cases.length;
  const timeoutMs = Number(process.env.EVAL_TIMEOUT_MS) || 30_000;
  const selected = cases.slice(0, max);

  let pass = 0;
  const failures: string[] = [];
  const versions = new Set<string>();
  const t0 = Date.now();

  for (const c of selected) {
    process.stdout.write(`• ${c.q.slice(0, 60).padEnd(60)} `);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${base}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: c.q, history: c.history ?? [], channel: "admin-test" }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.promptVersion) versions.add(data.promptVersion);

      const want = Array.isArray(c.expect) ? c.expect : [c.expect];
      const outcomeOk = want.includes(data.outcome);
      const textOk = !c.answerMatches || c.answerMatches.test(data.answer ?? "");
      if (outcomeOk && textOk) {
        console.log(`OK   ${data.outcome}`);
        pass++;
      } else {
        const why = !outcomeOk
          ? `got=${data.outcome} want=${want.join("|")}`
          : `answer did not match ${c.answerMatches}: "${String(data.answer).slice(0, 80)}"`;
        console.log(`FAIL ${why}`);
        failures.push(`${c.q} → ${why}`);
      }
    } catch (err) {
      console.log(`ERROR ${err instanceof Error ? err.message : err}`);
      failures.push(`${c.q} → error`);
    }
  }

  console.log(`\n${pass}/${selected.length} passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`prompt version(s): ${[...versions].join(", ") || "unknown"}`);
  if (failures.length) {
    console.log("Failures:");
    failures.forEach((f) => console.log(" -", f));
    process.exit(1);
  }
}

main();
