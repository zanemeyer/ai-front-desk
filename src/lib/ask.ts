import { randomUUID } from "crypto";
import { generateGroundedAnswer } from "./gemini";
import {
  addQuestion,
  getPublishedEntries,
  getSettings,
} from "./store";
import type { AskResult, HandbookEntry, QuestionLog } from "./types";

function detectSensitive(
  question: string,
  topics: string[]
): string | null {
  const lower = question.toLowerCase();
  for (const topic of topics) {
    if (lower.includes(topic.toLowerCase())) {
      return topic;
    }
  }
  // Extra keyword heuristics for common sensitive cases
  const heuristics: [RegExp, string][] = [
    [/\b(hurt|injured|injury|broke|bleeding|fell hard)\b/i, "injury"],
    [/\b(custody|restraining|court order)\b/i, "custody"],
    [/\b(dispute|overcharged|refund|chargeback)\b/i, "billing dispute"],
    [/\b(complaint about|report (a |the )?teacher|fire (a |the )?teacher)\b/i, "staff complaint"],
  ];
  for (const [re, label] of heuristics) {
    if (re.test(question)) return label;
  }
  return null;
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
  const sensitive = detectSensitive(trimmed, settings.sensitiveTopics);

  if (sensitive) {
    const log: QuestionLog = {
      id: randomUUID(),
      question: trimmed,
      askedAt: new Date().toISOString(),
      outcome: "escalation",
      topic: sensitive,
      escalationReason: `This touches on "${sensitive}", which a staff member should handle personally.`,
      resolved: false,
    };
    await addQuestion(log);
    return {
      outcome: "escalation",
      answer: `That's something ${settings.director.name} or another staff member should help with directly — I don't answer questions about ${sensitive} on my own. You can reach the director at ${settings.director.phone} or ${settings.director.email}, or tap "Message the director" below.`,
      citedEntries: [],
      questionId: log.id,
      escalationReason: log.escalationReason,
      director: settings.director,
    };
  }

  const entries = await getPublishedEntries();
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let llm;
  try {
    llm = await generateGroundedAnswer(trimmed, entries, today);
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
