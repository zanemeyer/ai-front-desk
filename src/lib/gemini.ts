import { GoogleGenAI, Type } from "@google/genai";
import type { ChatTurn, HandbookEntry } from "./types";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/**
 * Bump whenever the answer prompt or schema changes. Stored on every question
 * log row and printed by the eval, so a regression can be traced to a prompt.
 */
export const PROMPT_VERSION = "answer-v4";
export const CLASSIFIER_VERSION = "sensitive-v2";

function client() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey: key });
}

/* ------------------------------------------------------------------ */
/* Answer generation                                                   */
/* ------------------------------------------------------------------ */

export type LlmAnswer = {
  /** Verbatim excerpt from a cited entry; generated BEFORE the answer so the
   *  model commits to the source text first. Verified server-side. */
  supportingQuote: string;
  answer: string;
  citedEntryIds: string[];
  confidence: "high" | "medium" | "low";
  needsHuman: boolean;
  askClarification: boolean;
  clarificationQuestion: string;
  clarificationOptions: string[];
  intent: string;
  reason: string;
  topic: string;
};

const answerSchema = {
  type: Type.OBJECT,
  properties: {
    citedEntryIds: { type: Type.ARRAY, items: { type: Type.STRING } },
    supportingQuote: { type: Type.STRING },
    answer: { type: Type.STRING },
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
    needsHuman: { type: Type.BOOLEAN },
    askClarification: { type: Type.BOOLEAN },
    clarificationQuestion: { type: Type.STRING },
    clarificationOptions: { type: Type.ARRAY, items: { type: Type.STRING } },
    intent: { type: Type.STRING },
    reason: { type: Type.STRING },
    topic: { type: Type.STRING },
  },
  // Order matters: the model writes the citation and the verbatim quote
  // before it writes the answer, which measurably reduces inversions like
  // "we are open on Veterans Day" when the entry lists it under closures.
  propertyOrdering: [
    "citedEntryIds",
    "supportingQuote",
    "answer",
    "confidence",
    "needsHuman",
    "askClarification",
    "clarificationQuestion",
    "clarificationOptions",
    "intent",
    "reason",
    "topic",
  ],
  required: [
    "citedEntryIds",
    "supportingQuote",
    "answer",
    "confidence",
    "needsHuman",
    "askClarification",
    "clarificationQuestion",
    "clarificationOptions",
    "intent",
    "reason",
    "topic",
  ],
};

function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

export function formatHandbook(entries: HandbookEntry[], now: Date): string {
  return entries
    .map((e) => {
      const meta: string[] = [`updated ${daysSince(e.updatedAt, now)} days ago`];
      if (e.effectiveFrom || e.effectiveUntil) {
        meta.push(
          `in effect ${e.effectiveFrom ?? "…"} to ${e.effectiveUntil ?? "…"}`
        );
      }
      if (e.reviewEveryDays) meta.push(`changes every ~${e.reviewEveryDays} days`);
      return `### [${e.id}] ${e.category} — ${e.title} (${meta.join("; ")})\n${e.content}`;
    })
    .join("\n\n");
}

export async function generateGroundedAnswer(args: {
  question: string;
  entries: HandbookEntry[];
  today: string;
  now: Date;
  history?: ChatTurn[];
}): Promise<LlmAnswer> {
  const { question, entries, today, now, history = [] } = args;
  const handbook = formatHandbook(entries, now);

  const convo = history.length
    ? history
        .slice(-4)
        .map((t) => `${t.role === "parent" ? "Parent" : "Front Desk"}: ${t.text}`)
        .join("\n")
    : "(none)";

  const prompt = `You are the AI Front Desk for Sunny Hollow Early Learning Center.
Answer the parent's latest question using ONLY the handbook entries below.
Today's date is ${today}.

CONVERSATION SO FAR (use it to resolve follow-ups like "what about toddlers?"):
${convo}

RULES
- Only state facts that appear in the handbook. Do not invent policies.
- Cite the entry IDs you used in citedEntryIds (exact IDs from the handbook).
- supportingQuote: copy the exact sentence or fragment from a cited entry that answers the question, character for character (no paraphrase, no ellipsis). Write it BEFORE the answer and make sure the answer agrees with it. If a holiday appears in a "closed on" list, the answer is that we are closed. Empty string only when asking for clarification or when nothing applies.
- If the question is ambiguous in a way that changes the answer (e.g. "what's the tuition?" when rates differ by age group, or "what's for lunch?" without a day), set askClarification=true, put a short friendly question in clarificationQuestion, and give 2–5 concrete tappable options in clarificationOptions (e.g. ["Infants","Toddlers","Twos","Preschool","Pre-K"]). Leave answer empty in that case. Do NOT ask for clarification if the conversation already resolves it, if one short answer covers it, or if the handbook gives one answer for most children (e.g. a daily schedule for toddlers through Pre-K): answer with that and mention the exception in a few words. Ask only when you truly cannot give a useful answer without the detail.
- If the handbook does not contain enough information, set confidence to "low", needsHuman to true, and explain in reason. Leave answer as a short friendly note that this isn't in the handbook.
- Prefer confidence "high" when one or more entries clearly answer the question; "medium" if partial; "low" if missing.
- Keep answer warm, concise (1–3 sentences), and specific to this center. No filler closings like "have a wonderful day."
- For yes/no questions (e.g. "Are you open…?", "Do you offer…?"), start with a clear Yes or No that matches the facts. Never write "Yes, we are closed" or "No, we are open."
  Example: Q: "Are you open on Veterans Day?" A: "No — we are closed on Veterans Day (November 11, 2026)."
- Use today's date to resolve "today", "tomorrow", and weekday-specific items like the lunch menu.
- Entries marked "changes every ~N days" may be stale if updated longer ago than that; still answer, but keep it short — the system adds a caveat automatically.
- intent: a short snake_case label for what the parent wants (e.g. "holiday_hours", "sibling_discount", "lunch_menu"). Reuse the same label for the same need phrased differently.
- reason: one sentence explaining what in the handbook did or did not support the answer. This is shown to staff.
- topic: one of the handbook categories when possible.

HANDBOOK:
${handbook}

LATEST PARENT QUESTION:
${question}`;

  const ai = client();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: answerSchema,
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Empty Gemini response");
  return JSON.parse(text) as LlmAnswer;
}

/* ------------------------------------------------------------------ */
/* Sensitivity classifier (separate, parallel call)                    */
/* ------------------------------------------------------------------ */

export type SensitivityVerdict = {
  sensitive: boolean;
  topic: string;
  reason: string;
};

const sensitivitySchema = {
  type: Type.OBJECT,
  properties: {
    sensitive: { type: Type.BOOLEAN },
    topic: { type: Type.STRING },
    reason: { type: Type.STRING },
  },
  required: ["sensitive", "topic", "reason"],
};

/**
 * Dedicated classifier so sensitivity judgement is independent of answer
 * quality and can be measured (scripts/eval-sensitive.ts reports
 * precision/recall against a labeled set).
 */
export async function classifySensitivity(
  question: string,
  sensitiveTopics: string[],
  history: ChatTurn[] = []
): Promise<SensitivityVerdict> {
  const list = sensitiveTopics.map((t) => `- ${t}`).join("\n");
  const convo = history.length
    ? history.slice(-2).map((t) => `${t.role}: ${t.text}`).join("\n")
    : "(none)";

  const prompt = `You triage messages from parents to a childcare center's automated front desk.
Decide whether a HUMAN staff member must handle this message instead of the automated system.

Mark sensitive=true ONLY when the message is about one of these situations:
${list}

Mark sensitive=false for general policy or logistics questions, even if they share words with the list. The automated system has the center handbook and is EXPECTED to answer routine questions about fees, refund policy, illness/fever exclusion rules, when a sick child can return, pickup rules, and schedules.
Not sensitive: "Is the registration fee refundable?", "My child has a fever, can they come in?", "My car broke down, I'll be late", "potty accident, spare clothes?", "Are vaccines required?", "What's your illness policy?", "Can I give my child Tylenol before drop-off?" (asks about policy, not asking staff to medicate).
Sensitive: "My child came home with a bruise, what happened?", "I want to dispute a late fee", "I have a concern about a teacher", "Can you give my son his antibiotics at lunch?", "My ex is not allowed to pick up our daughter."
When in doubt between "routine policy question" and "sensitive", prefer routine UNLESS the message is about a specific child's incident, a specific staff member, a specific disputed charge, or asks staff to take a medical action.

topic: 2–4 word noun phrase when sensitive that reads naturally after "a"/"an" (e.g. "child incident", "billing dispute", "staff concern", "medication request", "custody matter", "safety concern"), else "".
reason: one short sentence.

Recent conversation: ${convo}
Message: ${question}`;

  const ai = client();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: sensitivitySchema,
      temperature: 0,
    },
  });
  const text = response.text;
  if (!text) throw new Error("Empty Gemini response");
  return JSON.parse(text) as SensitivityVerdict;
}

/* ------------------------------------------------------------------ */
/* Handbook drafting                                                   */
/* ------------------------------------------------------------------ */

export type DraftEntry = {
  title: string;
  category: string;
  content: string;
};

const draftSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    category: { type: Type.STRING },
    content: { type: Type.STRING },
  },
  required: ["title", "category", "content"],
};

export async function draftHandbookEntry(
  question: string,
  operatorAnswer: string,
  relatedQuestions: string[] = []
): Promise<DraftEntry> {
  const related = relatedQuestions.length
    ? `\nOther parents asked the same thing as:\n${relatedQuestions.map((q) => `- ${q}`).join("\n")}\nMake sure the entry answers all of these phrasings.`
    : "";

  const prompt = `You help a childcare center director turn a parent question and a quick staff answer into a clean handbook policy entry.

Parent question: ${question}${related}
Staff's quick answer: ${operatorAnswer}

Write a clear, parent-facing handbook entry.
- title: short policy title
- category: one of Hours & Closures, Tuition & Billing, Health & Illness, Meals, Enrollment & Tours, Daily Schedule, Drop-off & Pickup, Weather
- content: 2–5 sentences of policy language, specific and actionable, written as center policy (not "we told the parent...")`;

  const ai = client();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: draftSchema,
      temperature: 0.3,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Empty Gemini response");
  return JSON.parse(text) as DraftEntry;
}
