import { randomUUID } from "crypto";
import {
  classifySensitivity,
  generateGroundedAnswer,
  PROMPT_VERSION,
  type LlmAnswer,
  type SensitivityVerdict,
} from "./gemini";
import { notifyStaff } from "./notify";
import { addQuestion, getPublishedEntries, getSettings } from "./store";
import type {
  AskResult,
  Channel,
  ChatTurn,
  HandbookEntry,
  QuestionLog,
} from "./types";

const CENTER_TZ = "America/Denver";

/* ------------------------------------------------------------------ */
/* Sensitive gate: hard blocks + dedicated classifier                  */
/* ------------------------------------------------------------------ */

/**
 * Deterministic hard blocks for unambiguous situations. These never reach the
 * model. Everything else is judged by the sensitivity classifier, which runs
 * in parallel with answer generation so it adds no latency.
 */
export const HARD_BLOCKS: [RegExp, string][] = [
  [/\b(abuse|abused|neglect|molest\w*|inappropriate(ly)? touch\w*)\b/i, "a safety concern"],
  [/\b(custody|restraining order|court order|protective order)\b/i, "custody or legal orders"],
  [/\b(lawsuit|sue\b|suing|attorney|lawyer|legal action)\b/i, "legal matters"],
  [/\b(dispute|overcharged|chargeback)\b/i, "a billing dispute"],
  [/\b(complaint|concern|issue|problem|report)\b.{0,40}\b(teacher|staff|caregiver|aide)\b/i, "a staff concern"],
  [/\b(my|our)\s+(child|son|daughter|kid|toddler|baby|infant)\b.{0,60}\b(injur\w*|hurt|bleeding|bruise\w*|bitten|bit by|got bit|scrape\w*|fell)\b/i, "an incident involving your child"],
  [/\b(injur\w*|hurt|bleeding|bruise\w*|bitten|scrape\w*|fell)\b.{0,60}\b(my|our)\s+(child|son|daughter|kid|toddler|baby|infant)\b/i, "an incident involving your child"],
  [/\bwhat happened\b.{0,40}\b(my|our|his|her)\b/i, "an incident involving your child"],
];

export function detectHardBlock(question: string): string | null {
  for (const [re, label] of HARD_BLOCKS) {
    if (re.test(question)) return label;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Post-processing helpers                                             */
/* ------------------------------------------------------------------ */

export function verifyCitations(
  citedIds: string[],
  entries: HandbookEntry[]
): { valid: HandbookEntry[]; rejected: string[] } {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const valid: HandbookEntry[] = [];
  const rejected: string[] = [];
  for (const id of citedIds) {
    const entry = byId.get(id);
    if (entry) valid.push(entry);
    else rejected.push(id);
  }
  return { valid, rejected };
}

// Alphanumerics only: Gemini's structured output mangles en-dashes and curly
// quotes (often into "\n\n"), so punctuation can't be part of the comparison.
const normalizeText = (s: string) =>
  s
    .toLowerCase()
    .replace(/\\?text(en|em)dash/g, " ") // seen: "6 weeks\textendash12 months"
    .replace(/[^a-z0-9$%]+/g, " ")
    .trim();

/** Share of `needle` tokens found in `hay` in order (greedy). */
function orderedTokenCoverage(needle: string, hay: string): number {
  const tokens = needle.split(" ").filter(Boolean);
  if (tokens.length === 0) return 0;
  let pos = 0;
  let hit = 0;
  for (const t of tokens) {
    const i = hay.indexOf(t, pos);
    if (i >= 0) {
      hit++;
      pos = i + t.length;
    }
  }
  return hit / tokens.length;
}

/**
 * The model must quote its source verbatim before answering. Check that the
 * quote really appears in one of the cited entries. A paraphrased or invented
 * quote is a signal the model drifted from the handbook, so the caller
 * downgrades confidence and records it for staff.
 */
export function verifyQuote(quote: string, cited: HandbookEntry[]): boolean {
  // Tolerate elided quotes ("closed on the following holidays: ... Veterans
  // Day"): every fragment must appear, in order, in one cited entry.
  const fragments = (quote ?? "")
    .split(/\.{3}|…/)
    .map(normalizeText)
    .filter((f) => f.length >= 8);
  if (fragments.length === 0) return false;
  return cited.some((e) => {
    const hay = normalizeText(`${e.title} ${e.content}`);
    let pos = 0;
    let exact = true;
    for (const f of fragments) {
      const i = hay.indexOf(f, pos);
      if (i < 0) {
        exact = false;
        break;
      }
      pos = i + f.length;
    }
    if (exact) return true;
    // Fallback for cosmetic mangling (dropped/garbled punctuation tokens):
    // nearly every word must still appear, in order. Invented quotes don't.
    return orderedTokenCoverage(fragments.join(" "), hay) >= 0.9;
  });
}

/** Fix contradictory Yes/No leads (e.g. "Yes, we are closed…"). */
export function fixYesNoPolarity(question: string, answer: string): string {
  const q = question.toLowerCase();
  const asksOpen =
    /\b(are you open|is (the )?(center|school|daycare) open|will you be open|do you open)\b/.test(q);
  const asksClosed =
    /\b(are you closed|is (the )?(center|school|daycare) closed|will you be closed)\b/.test(q);
  if (!asksOpen && !asksClosed) return answer;

  const lead = answer.match(/^(yes|no)\b/i);
  if (!lead) return answer;

  const body = answer.slice(lead[0].length);
  const saysClosed = /\b(closed|not open|won'?t be open|will not be open|are not open)\b/i.test(body);
  const saysOpen = !saysClosed && /\b(open|will be open|are open|remain open)\b/i.test(body);

  let fixed = answer;
  if (asksOpen && saysClosed && /^yes\b/i.test(fixed)) fixed = fixed.replace(/^yes\b/i, "No");
  else if (asksOpen && saysOpen && /^no\b/i.test(fixed)) fixed = fixed.replace(/^no\b/i, "Yes");
  else if (asksClosed && saysClosed && /^no\b/i.test(fixed)) fixed = fixed.replace(/^no\b/i, "Yes");
  else if (asksClosed && saysOpen && /^yes\b/i.test(fixed)) fixed = fixed.replace(/^yes\b/i, "No");

  return fixed.replace(/^(No|Yes),\s+/i, "$1 — ");
}

/** Freshness caveats for cited entries that change often and are overdue. */
export function freshnessCaveats(cited: HandbookEntry[], now: Date): string[] {
  const out: string[] = [];
  for (const e of cited) {
    if (!e.reviewEveryDays) continue;
    const age = Math.floor((now.getTime() - new Date(e.updatedAt).getTime()) / 86_400_000);
    if (age > e.reviewEveryDays) {
      out.push(
        `"${e.title}" was last updated ${age} days ago and usually changes every ${e.reviewEveryDays === 7 ? "week" : `${e.reviewEveryDays} days`} — please confirm with the office.`
      );
    }
  }
  return out;
}

/** "medication request" → "a medication request"; leaves "an incident…" alone. */
export function withArticle(topic: string): string {
  const t = topic.trim().toLowerCase();
  if (/^(a|an|the)\s/.test(t)) return t;
  return `${/^[aeiou]/.test(t) ? "an" : "a"} ${t}`;
}

function centerDate(now: Date): { today: string; isoDate: string } {
  const today = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: CENTER_TZ,
  });
  const isoDate = now.toLocaleDateString("en-CA", { timeZone: CENTER_TZ }); // YYYY-MM-DD
  return { today, isoDate };
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export async function askQuestion(
  question: string,
  opts: { history?: ChatTurn[]; channel?: Channel } = {}
): Promise<AskResult> {
  const trimmed = question.trim();
  if (!trimmed) throw new Error("Question is required");

  const history = (opts.history ?? []).slice(-4);
  const channel: Channel = opts.channel ?? "web";
  const now = new Date();
  const { today, isoDate } = centerDate(now);
  const settings = await getSettings();

  const escalateWith = async (
    topic: string,
    reason: string
  ): Promise<AskResult> => {
    const log: QuestionLog = {
      id: randomUUID(),
      question: trimmed,
      askedAt: now.toISOString(),
      outcome: "escalation",
      channel,
      topic,
      intent: topic.replace(/^(an?|the) /, "").replace(/\s+/g, "_").toLowerCase(),
      escalationReason: reason,
      reason,
      promptVersion: PROMPT_VERSION,
      resolved: false,
    };
    await addQuestion(log);

    let staffNotified = false;
    if (channel === "admin-test") {
      // Operator is testing from the control center; don't page anyone.
    } else try {
      await notifyStaff({
        questionId: log.id,
        question: trimmed,
        topic,
        channel,
        director: settings.director,
        centerName: settings.centerName,
      });
      staffNotified = true;
    } catch (err) {
      console.error("notifyStaff failed:", err);
    }
    if (channel === "admin-test") staffNotified = true; // show the parent-facing copy as it would appear

    const first = settings.director.name.split(" ")[0];
    const answer = staffNotified
      ? `This sounds like ${topic}, and that deserves a real person rather than an automated answer. I've pinged ${first} with your message so you don't have to repeat yourself — expect a reply during office hours. If it's urgent, call ${settings.director.phone}.`
      : `This sounds like ${topic}, and that deserves a real person rather than an automated answer. Please reach ${first} at ${settings.director.phone} or ${settings.director.email}.`;

    return {
      outcome: "escalation",
      answer,
      citedEntries: [],
      questionId: log.id,
      escalationReason: reason,
      staffNotified,
      director: settings.director,
      promptVersion: PROMPT_VERSION,
    };
  };

  // 1. Hard blocks (deterministic, no model call)
  const hardBlock = detectHardBlock(trimmed);
  if (hardBlock) return escalateWith(hardBlock, `Matched a hard-block rule for ${hardBlock}.`);

  // 2. Classifier and answer in parallel
  const entries = await getPublishedEntries(isoDate);

  let verdict: SensitivityVerdict | null = null;
  let llm: LlmAnswer | null = null;
  const [vRes, aRes] = await Promise.allSettled([
    classifySensitivity(trimmed, settings.sensitiveTopics, history),
    generateGroundedAnswer({ question: trimmed, entries, today, now, history }),
  ]);
  if (vRes.status === "fulfilled") verdict = vRes.value;
  else console.error("classifySensitivity failed:", vRes.reason);
  if (aRes.status === "fulfilled") llm = aRes.value;
  else console.error("generateGroundedAnswer failed:", aRes.reason);

  if (verdict?.sensitive) {
    const topic = verdict.topic ? withArticle(verdict.topic) : "a sensitive question";
    return escalateWith(topic, verdict.reason || "Flagged by the sensitivity classifier.");
  }

  // 3. Model unavailable → fail closed as a gap
  if (!llm) {
    const log: QuestionLog = {
      id: randomUUID(),
      question: trimmed,
      askedAt: now.toISOString(),
      outcome: "gap",
      channel,
      topic: "Unknown",
      reason: "Model call failed; failed closed.",
      promptVersion: PROMPT_VERSION,
      resolved: false,
    };
    await addQuestion(log);
    return {
      outcome: "gap",
      answer: "I couldn't look that up right now. I've flagged your question for the office — someone will follow up shortly.",
      citedEntries: [],
      questionId: log.id,
      director: settings.director,
      promptVersion: PROMPT_VERSION,
    };
  }

  const intent = (llm.intent || "").trim().toLowerCase().replace(/\s+/g, "_") || undefined;

  // 4. Clarification instead of a wall of text
  if (llm.askClarification && llm.clarificationOptions?.length >= 2) {
    const log: QuestionLog = {
      id: randomUUID(),
      question: trimmed,
      askedAt: now.toISOString(),
      outcome: "clarify",
      channel,
      topic: llm.topic,
      intent,
      reason: llm.reason,
      answerPreview: llm.clarificationQuestion,
      promptVersion: PROMPT_VERSION,
    };
    await addQuestion(log);
    return {
      outcome: "clarify",
      answer: llm.clarificationQuestion || "Could you tell me a bit more?",
      clarificationOptions: llm.clarificationOptions.slice(0, 5),
      citedEntries: [],
      questionId: log.id,
      director: settings.director,
      promptVersion: PROMPT_VERSION,
    };
  }

  // 5. Verify grounding; fail closed when weak
  const { valid: cited, rejected } = verifyCitations(llm.citedEntryIds ?? [], entries);
  const weak = llm.needsHuman || llm.confidence === "low" || cited.length === 0;

  if (weak) {
    const log: QuestionLog = {
      id: randomUUID(),
      question: trimmed,
      askedAt: now.toISOString(),
      outcome: "gap",
      channel,
      topic: llm.topic || "Unknown",
      intent,
      confidence: llm.confidence,
      reason:
        llm.reason ||
        (rejected.length ? `Model cited unknown entries: ${rejected.join(", ")}` : "No supporting handbook entry."),
      rejectedCitationIds: rejected,
      promptVersion: PROMPT_VERSION,
      resolved: false,
    };
    await addQuestion(log);
    return {
      outcome: "gap",
      answer:
        "I don't have that in our handbook yet, so I don't want to guess. I've sent this to the office — they'll get you an accurate answer, and we'll add it to the handbook so the next parent doesn't have to wait.",
      citedEntries: [],
      confidence: llm.confidence,
      questionId: log.id,
      director: settings.director,
      promptVersion: PROMPT_VERSION,
    };
  }

  // 6. Answer. If the model's verbatim quote isn't actually in a cited entry,
  //    it was reasoning from memory rather than the handbook: downgrade and
  //    tell staff, but still answer (the citations themselves are valid).
  const answer = fixYesNoPolarity(trimmed, llm.answer);
  const caveats = freshnessCaveats(cited, now);
  const quoteOk = verifyQuote(llm.supportingQuote, cited);
  const confidence: AskResult["confidence"] = quoteOk
    ? llm.confidence
    : llm.confidence === "high"
      ? "medium"
      : llm.confidence;
  const reason = quoteOk
    ? llm.reason
    : `${llm.reason} [Quote not found verbatim in cited entries: "${(llm.supportingQuote ?? "").slice(0, 240)}"]`;

  const log: QuestionLog = {
    id: randomUUID(),
    question: trimmed,
    askedAt: now.toISOString(),
    outcome: "answered",
    channel,
    topic: llm.topic,
    intent,
    answerPreview: answer.slice(0, 180),
    citedEntryIds: cited.map((e) => e.id),
    rejectedCitationIds: rejected,
    confidence,
    reason,
    promptVersion: PROMPT_VERSION,
    feedback: null,
  };
  await addQuestion(log);

  return {
    outcome: "answered",
    answer,
    citedEntries: cited,
    caveats,
    confidence,
    questionId: log.id,
    director: settings.director,
    promptVersion: PROMPT_VERSION,
  };
}
