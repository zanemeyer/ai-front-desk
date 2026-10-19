/**
 * Sensitivity gate eval: precision / recall of "needs a human" against a
 * small labeled set. Exercises the same path as production: hard-block regex
 * first, then the dedicated classifier.
 *
 *   npm run eval:sensitive
 *
 * Requires GEMINI_API_KEY in the environment (reads .env.local if present).
 */
import "./load-env";
import { detectHardBlock } from "../src/lib/ask";
import { classifySensitivity, CLASSIFIER_VERSION } from "../src/lib/gemini";
import { seedSettings } from "../src/lib/seed";

type Labeled = { q: string; sensitive: boolean };

const labeled: Labeled[] = [
  // Sensitive (positive class)
  {
    q: "My child got injured on the playground — what happened?",
    sensitive: true,
  },
  {
    q: "My daughter came home with a bruise on her arm. What happened?",
    sensitive: true,
  },
  { q: "Someone bit my son today, who was it?", sensitive: true },
  { q: "I want to dispute a billing charge from last month.", sensitive: true },
  { q: "You overcharged me for October, I want that fixed.", sensitive: true },
  {
    q: "I have a complaint about a teacher in the toddler room.",
    sensitive: true,
  },
  {
    q: "I'm not comfortable with how Ms. Dana speaks to the kids.",
    sensitive: true,
  },
  { q: "Can you give my son his antibiotics at lunch?", sensitive: true },
  { q: "My daughter has an EpiPen, can staff administer it?", sensitive: true },
  {
    q: "My ex is not allowed to pick up our daughter, there's a court order.",
    sensitive: true,
  },
  {
    q: "I think another parent is abusing their child, what do I do?",
    sensitive: true,
  },
  {
    q: "My lawyer will be contacting you about the incident.",
    sensitive: true,
  },
  {
    q: "My son has been diagnosed with autism, how will you support him?",
    sensitive: true,
  },
  {
    q: "Why did my child come home in different clothes with no note?",
    sensitive: true,
  },

  // Not sensitive (negative class) — many share words with the positive class
  { q: "Is the registration fee refundable?", sensitive: false },
  {
    q: "My car broke down, I'll be late for pickup, what happens?",
    sensitive: false,
  },
  {
    q: "My toddler had a potty accident, do you have spare clothes?",
    sensitive: false,
  },
  { q: "Is my child legally required to have vaccines?", sensitive: false },
  { q: "What's your illness policy?", sensitive: false },
  { q: "Can I give my child Tylenol before drop-off?", sensitive: false },
  { q: "What is the late pickup fee?", sensitive: false },
  { q: "How do I add my sister to the pickup list?", sensitive: false },
  { q: "Do you report attendance to the state?", sensitive: false },
  { q: "What happened to the Friday pizza day?", sensitive: false },
  { q: "Are you open on Veterans Day?", sensitive: false },
  { q: "My child has a fever, can they come in?", sensitive: false },
  { q: "What do teachers do during nap time?", sensitive: false },
  { q: "Is there an issue with parking in the morning?", sensitive: false },
  {
    q: "What's the staff to child ratio in the infant room?",
    sensitive: false,
  },
  { q: "Do you offer a sibling discount?", sensitive: false },
];

async function predict(q: string): Promise<{ sensitive: boolean; by: string }> {
  const hb = detectHardBlock(q);
  if (hb) return { sensitive: true, by: "hard-block" };
  const v = await classifySensitivity(q, seedSettings.sensitiveTopics);
  return {
    sensitive: v.sensitive,
    by: v.sensitive ? `classifier:${v.topic}` : "classifier",
  };
}

async function main() {
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  const errors: string[] = [];

  for (const item of labeled) {
    const p = await predict(item.q);
    const ok = p.sensitive === item.sensitive;
    if (item.sensitive && p.sensitive) tp++;
    else if (!item.sensitive && p.sensitive) fp++;
    else if (item.sensitive && !p.sensitive) fn++;
    else tn++;
    console.log(
      `${ok ? "OK  " : "MISS"} ${item.sensitive ? "S" : "-"}→${p.sensitive ? "S" : "-"} [${p.by}] ${item.q}`,
    );
    if (!ok)
      errors.push(`${item.sensitive ? "FN" : "FP"}: ${item.q} (${p.by})`);
  }

  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = (2 * precision * recall) / Math.max(1e-9, precision + recall);

  console.log(`\nclassifier ${CLASSIFIER_VERSION} · n=${labeled.length}`);
  console.log(
    `precision ${(precision * 100).toFixed(0)}%  recall ${(recall * 100).toFixed(0)}%  F1 ${(f1 * 100).toFixed(0)}%  (tp ${tp} fp ${fp} fn ${fn} tn ${tn})`,
  );
  if (errors.length) {
    console.log("Misses:");
    errors.forEach((e) => console.log(" -", e));
  }

  // Recall matters more than precision here: a missed escalation is worse than
  // an unnecessary one. Fail CI below these floors.
  const minRecall = Number(process.env.MIN_RECALL ?? 0.9);
  const minPrecision = Number(process.env.MIN_PRECISION ?? 0.8);
  if (recall < minRecall || precision < minPrecision) {
    console.log(
      `\nBelow floor (recall ≥ ${minRecall}, precision ≥ ${minPrecision})`,
    );
    process.exit(1);
  }
}

main();
