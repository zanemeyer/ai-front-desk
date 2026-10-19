import { randomUUID } from "crypto";
import { generateGroundedAnswer } from "./gemini";
import {
  addQuestion,
  getPublishedEntries,
  getSettings,
} from "./store";
import type { AskResult, HandbookEntry, QuestionLog } from "./types";

/**
 * Deterministic hard blocks for unambiguous sensitive situations.
 * Everything else is judged by the model using the operator's topic list.
 */
const HARD_BLOCKS: [RegExp, string][] = [
  [/\b(abuse|abused|neglect|molest\w*|inappropriate(ly)? touch\w*)\b/i, "a safety concern"],
  [/\b(custody|restraining order|court order|protective order)\b/i, "custody or legal orders"],
  [/\b(lawsuit|sue\b|suing|attorney|lawyer|legal action)\b/i, "legal matters"],
  [/\b(dispute|overcharged|chargeback)\b/i, "a billing dispute"],
  [/\b(complaint|concern|issue|problem|report)\b.{0,40}\b(teacher|staff|caregiver|aide)\b/i, "a staff concern"],
  [/\b(my|our)\s+(child|son|daughter|kid|toddler|baby|infant)\b.{0,60}\b(injur\w*|hurt|bleeding|bruise\w*|bitten|bit by|got bit|scrape\w*|fell)\b/i, "an incident involving your child"],
  [/\b(injur\w*|hurt|bleeding|bruise\w*|bitten|scrape\w*|fell)\b.{0,60}\b(my|our)\s+(child|son|daughter|kid|toddler|baby|infant)\b/i, "an incident involving your child"],
  [/\bwhat happened\b.{0,40}\b(my|our|his|her)\b/i, "an incident involving your child"],
];

function detectHardBlock(question: string): string | null {
  for (const [re, label] of HARD_BLOCKS) {
    if (re.test(question)) return label;
  }
  return null;
}

function escalationCopy(
  topic: string,
  director: { name: string; phone: string; email: string }
): string {
  return `This sounds like ${topic}, and that deserves a real person rather than an automated answer. ${director.name} can help directly at ${director.phone} or ${director.email}, or tap "Message the director" below and we'll follow up.`;
}

function verifyCitations(
  citedIds: string[],
  entries: HandbookEntry[]
): HandbookEntry[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const valid: HandbookEntry[] = [];
  for (const id of citedIds) {
    const entry = byId.get(id);
    if (entry) valid.push(entry);
  }
  return valid;
}

/** Fix contradictory Yes/No leads (e.g. "Yes, we are closed…"). */
export function fixYesNoPolarity(question: string, answer: string): string {
  const q = question.toLowerCase();
  const asksOpen =
    /\b(are you open|is (the )?(center|school|daycare) open|will you be open|do you open)\b/.test(
      q
    );
  const asksClosed =
    /\b(are you closed|is (the )?(center|school|daycare) closed|will you be closed)\b/.test(
      q
    );
  if (!asksOpen && !asksClosed) return answer;

  const lead = answer.match(/^(yes|no)\b/i);
  if (!lead) return answer;

  const body = answer.slice(lead[0].length);
  const saysClosed =
    /\b(closed|not open|won'?t be open|will not be open|are not open)\b/i.test(
      body
    );
  const saysOpen =
    !saysClosed &&
    /\b(open|will be open|are open|remain open)\b/i.test(body);

  let fixed = answer;
  if (asksOpen && saysClosed && /^yes\b/i.test(fixed)) {
    fixed = fixed.replace(/^yes\b/i, "No");
  } else if (asksOpen && saysOpen && /^no\b/i.test(fixed)) {
    fixed = fixed.replace(/^no\b/i, "Yes");
  } else if (asksClosed && saysClosed && /^no\b/i.test(fixed)) {
    fixed = fixed.replace(/^no\b/i, "Yes");
  } else if (asksClosed && saysOpen && /^yes\b/i.test(fixed)) {
    fixed = fixed.replace(/^yes\b/i, "No");
  }

  // Soften awkward "No, we will be closed" → keep natural punctuation
  fixed = fixed.replace(/^(No|Yes),\s+/i, "$1 — ");
  return fixed;
}

export async function askQuestion(question: string): Promise<AskResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    throw new Error("Question is required");
  }

  const settings = await getSettings();

  const escalateWith = async (topic: string): Promise<AskResult> => {
    const log: QuestionLog = {
      id: randomUUID(),
      question: trimmed,
      askedAt: new Date().toISOString(),
      outcome: "escalation",
      topic,
      escalationReason: `Flagged as ${topic}; a staff member should respond personally.`,
      resolved: false,
    };
    await addQuestion(log);
    return {
      outcome: "escalation",
      answer: escalationCopy(topic, settings.director),
      citedEntries: [],
      questionId: log.id,
      escalationReason: log.escalationReason,
      director: settings.director,
    };
  };

  const hardBlock = detectHardBlock(trimmed);
  if (hardBlock) return escalateWith(hardBlock);

  const entries = await getPublishedEntries();
  // Center is in Albuquerque; resolve "today"/"tomorrow" in local time.
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Denver",
  });

  let llm;
  try {
    llm = await generateGroundedAnswer(
      trimmed,
      entries,
      today,
      settings.sensitiveTopics
    );
  } catch (err) {
    console.error("Gemini generateGroundedAnswer failed:", err);
    // Fail closed if the model is unavailable
    const log: QuestionLog = {
      id: randomUUID(),
      question: trimmed,
      askedAt: new Date().toISOString(),
      outcome: "gap",
      topic: "Unknown",
      resolved: false,
    };
    await addQuestion(log);
    return {
      outcome: "gap",
      answer:
        "I couldn't look that up right now. I've flagged your question for the office — someone will follow up shortly.",
      citedEntries: [],
      questionId: log.id,
      director: settings.director,
    };
  }

  if (llm.escalate) {
    const topic = (llm.escalationTopic || "").trim();
    return escalateWith(
      topic ? `a question about ${topic.toLowerCase()}` : "a sensitive question"
    );
  }

  const cited = verifyCitations(llm.citedEntryIds ?? [], entries);
  const weak =
    llm.needsHuman ||
    llm.confidence === "low" ||
    (llm.confidence !== "high" && cited.length === 0) ||
    (llm.confidence === "high" && cited.length === 0);

  if (weak) {
    const log: QuestionLog = {
      id: randomUUID(),
      question: trimmed,
      askedAt: new Date().toISOString(),
      outcome: "gap",
      topic: llm.topic || "Unknown",
      confidence: llm.confidence,
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
    };
  }

  const answer = fixYesNoPolarity(trimmed, llm.answer);

  const log: QuestionLog = {
    id: randomUUID(),
    question: trimmed,
    askedAt: new Date().toISOString(),
    outcome: "answered",
    topic: llm.topic,
    answerPreview: answer.slice(0, 180),
    citedEntryIds: cited.map((e) => e.id),
    confidence: llm.confidence,
    feedback: null,
  };
  await addQuestion(log);

  return {
    outcome: "answered",
    answer,
    citedEntries: cited,
    confidence: llm.confidence,
    questionId: log.id,
    director: settings.director,
  };
}
