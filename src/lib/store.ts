import { Redis } from "@upstash/redis";
import { seedEntries, seedQuestions, seedSettings } from "./seed";
import type { HandbookEntry, QuestionLog, Settings } from "./types";

const KEYS = {
  entries: "afd:entries",
  questions: "afd:questions",
  settings: "afd:settings",
  seeded: "afd:seeded",
};

type MemoryState = {
  entries: HandbookEntry[];
  questions: QuestionLog[];
  settings: Settings;
};

declare global {
  // eslint-disable-next-line no-var
  var __afdMemory: MemoryState | undefined;
}

function memory(): MemoryState {
  if (!globalThis.__afdMemory) {
    globalThis.__afdMemory = {
      entries: structuredClone(seedEntries),
      questions: structuredClone(seedQuestions),
      settings: structuredClone(seedSettings),
    };
  }
  return globalThis.__afdMemory;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function ensureSeeded(redis: Redis): Promise<void> {
  const seeded = await redis.get(KEYS.seeded);
  if (seeded) return;
  await redis.set(KEYS.entries, seedEntries);
  await redis.set(KEYS.questions, seedQuestions);
  await redis.set(KEYS.settings, seedSettings);
  await redis.set(KEYS.seeded, true);
}

export async function getEntries(): Promise<HandbookEntry[]> {
  const redis = getRedis();
  if (!redis) return memory().entries;
  await ensureSeeded(redis);
  return (await redis.get<HandbookEntry[]>(KEYS.entries)) ?? [];
}

export async function getPublishedEntries(): Promise<HandbookEntry[]> {
  const entries = await getEntries();
  return entries.filter((e) => e.status === "published");
}

export async function saveEntries(entries: HandbookEntry[]): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    memory().entries = entries;
    return;
  }
  await redis.set(KEYS.entries, entries);
}

export async function upsertEntry(entry: HandbookEntry): Promise<HandbookEntry> {
  const entries = await getEntries();
  const idx = entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) entries[idx] = entry;
  else entries.unshift(entry);
  await saveEntries(entries);
  return entry;
}

export async function deleteEntry(id: string): Promise<void> {
  const entries = await getEntries();
  await saveEntries(entries.filter((e) => e.id !== id));
}

export async function getQuestions(): Promise<QuestionLog[]> {
  const redis = getRedis();
  if (!redis) return memory().questions;
  await ensureSeeded(redis);
  return (await redis.get<QuestionLog[]>(KEYS.questions)) ?? [];
}

export async function saveQuestions(questions: QuestionLog[]): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    memory().questions = questions;
    return;
  }
  await redis.set(KEYS.questions, questions);
}

export async function addQuestion(q: QuestionLog): Promise<QuestionLog> {
  const questions = await getQuestions();
  questions.unshift(q);
  await saveQuestions(questions);
  return q;
}

export async function updateQuestion(
  id: string,
  patch: Partial<QuestionLog>
): Promise<QuestionLog | null> {
  const questions = await getQuestions();
  const idx = questions.findIndex((q) => q.id === id);
  if (idx < 0) return null;
  questions[idx] = { ...questions[idx], ...patch };
  await saveQuestions(questions);
  return questions[idx];
}

export async function getSettings(): Promise<Settings> {
  const redis = getRedis();
  if (!redis) return memory().settings;
  await ensureSeeded(redis);
  return (await redis.get<Settings>(KEYS.settings)) ?? seedSettings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    memory().settings = settings;
    return;
  }
  await redis.set(KEYS.settings, settings);
}

export function usingRedis(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}
