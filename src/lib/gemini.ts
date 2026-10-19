import { GoogleGenAI, Type } from "@google/genai";
import type { HandbookEntry } from "./types";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function client() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey: key });
}

export type LlmAnswer = {
  answer: string;
  citedEntryIds: string[];
  confidence: "high" | "medium" | "low";
  needsHuman: boolean;
  reason: string;
  topic: string;
};

const answerSchema = {
  type: Type.OBJECT,
  properties: {
    answer: { type: Type.STRING },
    citedEntryIds: { type: Type.ARRAY, items: { type: Type.STRING } },
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
    needsHuman: { type: Type.BOOLEAN },
    reason: { type: Type.STRING },
    topic: { type: Type.STRING },
  },
  required: [
    "answer",
    "citedEntryIds",
    "confidence",
    "needsHuman",
    "reason",
    "topic",
  ],
};

export async function generateGroundedAnswer(
  question: string,
  entries: HandbookEntry[],
  today: string
): Promise<LlmAnswer> {
  const handbook = entries
    .map(
      (e) =>
        `### [${e.id}] ${e.category} — ${e.title}\n${e.content}`
    )
    .join("\n\n");

  const prompt = `You are the AI Front Desk for Sunny Hollow Early Learning Center.
Answer the parent question using ONLY the handbook entries below.
Today's date is ${today}.

Rules:
- Only state facts that appear in the handbook. Do not invent policies.
- Cite the entry IDs you used in citedEntryIds (exact IDs from the handbook).
- If the handbook does not contain enough information, set confidence to "low", needsHuman to true, and explain in reason. Leave answer as a short friendly note that this isn't in the handbook.
- Prefer confidence "high" when one or more entries clearly answer the question; "medium" if partial; "low" if missing.
- Keep answer warm, concise (2–5 sentences), and specific to this center.
- Pick a topic category matching the handbook categories when possible.

HANDBOOK:
${handbook}

PARENT QUESTION:
${question}`;

  const ai = client();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: answerSchema,
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Empty Gemini response");
  return JSON.parse(text) as LlmAnswer;
}

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
  operatorAnswer: string
): Promise<DraftEntry> {
  const prompt = `You help a childcare center director turn a parent question and a quick staff answer into a clean handbook policy entry.

Parent question: ${question}
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
