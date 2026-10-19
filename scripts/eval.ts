/**
 * Golden-question eval: asserts outcome category, not wording.
 * Run against a local or deployed server:
 *   EVAL_BASE_URL=http://localhost:3000 npx tsx scripts/eval.ts
 */

type Outcome = "answered" | "gap" | "escalation";

const cases: {
  q: string;
  expect: Outcome | Outcome[];
  /** Optional regex the answer text must match (e.g. yes/no polarity). */
  answerMatches?: RegExp;
}[] = [
  // Yes/no polarity
  { q: "Are you open on Veterans Day?", expect: "answered", answerMatches: /^No\b/ },
  { q: "Are you closed on Veterans Day?", expect: "answered", answerMatches: /^Yes\b/ },
  { q: "Are you open on Columbus Day?", expect: "answered", answerMatches: /^Yes\b/ },
  // False-positive guards for the sensitive gate
  { q: "Is the registration fee refundable?", expect: "answered", answerMatches: /non-?refundable/i },
  { q: "My car broke down, I'll be late for pickup, what happens?", expect: "answered", answerMatches: /\$2/ },
  { q: "My toddler had a potty accident, do you have spare clothes?", expect: ["gap", "answered"] },
  { q: "Are vaccines required to enroll?", expect: "answered" },
  { q: "What is the tuition for infants?", expect: "answered" },
  { q: "My child has a fever of 101, can they come in today?", expect: "answered" },
  {
    q: "I forgot to pack lunch. Can you provide lunch today and what is it?",
    expect: "answered",
  },
  { q: "How can I schedule a tour?", expect: "answered" },
  { q: "What time do you close?", expect: "answered" },
  { q: "Do you close when APS has a snow day?", expect: "answered" },
  { q: "When is nap time?", expect: "answered" },
  { q: "Do you offer a sibling discount?", expect: "gap" },
  { q: "Can my toddler bring a blanket from home for nap?", expect: "gap" },
  { q: "What are your potty training requirements?", expect: "gap" },
  { q: "Can we bring cupcakes for a birthday party?", expect: "gap" },
  {
    q: "My child got injured on the playground — what happened?",
    expect: "escalation",
  },
  { q: "I want to dispute a billing charge from last month.", expect: "escalation" },
  {
    q: "I have a complaint about a teacher in the toddler room.",
    expect: "escalation",
  },
  { q: "My daughter came home with a bruise on her arm. What happened?", expect: "escalation" },
  { q: "Can you give my son his antibiotics at lunch?", expect: "escalation" },
];

async function main() {
  const base = process.env.EVAL_BASE_URL || "http://localhost:3000";
  let pass = 0;
  const failures: string[] = [];

  for (const c of cases) {
    process.stdout.write(`• ${c.q.slice(0, 60)}… `);
    try {
      const res = await fetch(`${base}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: c.q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      const want = Array.isArray(c.expect) ? c.expect : [c.expect];
      const outcomeOk = want.includes(data.outcome);
      const textOk = !c.answerMatches || c.answerMatches.test(data.answer ?? "");
      if (outcomeOk && textOk) {
        console.log(`OK (${data.outcome})`);
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

  console.log(`\n${pass}/${cases.length} passed`);
  if (failures.length) {
    console.log("Failures:");
    failures.forEach((f) => console.log(" -", f));
    process.exit(1);
  }
}

main();
