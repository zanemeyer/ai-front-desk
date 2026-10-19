/**
 * Golden-question eval: asserts outcome category, not wording.
 * Run against a local or deployed server:
 *   EVAL_BASE_URL=http://localhost:3000 npx tsx scripts/eval.ts
 */

type Outcome = "answered" | "gap" | "escalation";

const cases: { q: string; expect: Outcome }[] = [
  { q: "Are you open on Veterans Day?", expect: "answered" },
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
      if (data.outcome === c.expect) {
        console.log(`OK (${data.outcome})`);
        pass++;
      } else {
        console.log(`FAIL got=${data.outcome} want=${c.expect}`);
        failures.push(`${c.q} → ${data.outcome} (want ${c.expect})`);
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
