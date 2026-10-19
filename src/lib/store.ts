import { Redis } from "@upstash/redis";
import { neon } from "@neondatabase/serverless";
import { seedEntries, seedQuestions, seedSettings, SEED_VERSION } from "./seed";
import type {
  HandbookEntry,
  QuestionLog,
  Settings,
  StaffNotification,
} from "./types";

/**
 * Tiny JSON key/value store with three backends, picked from env:
 *   1. Postgres (Neon via Vercel Marketplace)  — DATABASE_URL / POSTGRES_URL
 *   2. Upstash Redis                            — UPSTASH_REDIS_REST_URL/TOKEN
 *   3. In-memory (seeded)                       — local dev / no env
 * Operator edits and the question log must survive cold starts for the demo,
 * so production uses (1).
 */

const KEYS = {
  entries: "afd:entries",
  questions: "afd:questions",
  settings: "afd:settings",
  notifications: "afd:notifications",
  seedVersion: "afd:seedVersion",
};

interface KV {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  kind: "postgres" | "redis" | "memory";
}

/* ---------- Memory ---------- */

declare global {
  var __afdMemory: Map<string, unknown> | undefined;
}

function memoryKV(): KV {
  if (!globalThis.__afdMemory) globalThis.__afdMemory = new Map();
  const m = globalThis.__afdMemory;
  return {
    kind: "memory",
    async get<T>(key: string) {
      return (m.has(key) ? (m.get(key) as T) : null) ?? null;
    },
    async set<T>(key: string, value: T) {
      m.set(key, structuredClone(value));
    },
  };
}

/* ---------- Postgres (Neon) ---------- */

let pgReady: Promise<void> | null = null;

function postgresKV(url: string): KV {
  const sql = neon(url);
  if (!pgReady) {
    pgReady = sql`
      CREATE TABLE IF NOT EXISTS afd_kv (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.then(() => undefined);
  }
  return {
    kind: "postgres",
    async get<T>(key: string) {
      await pgReady;
      const rows = (await sql`SELECT value FROM afd_kv WHERE key = ${key}`) as {
        value: T;
      }[];
      return rows.length ? rows[0].value : null;
    },
    async set<T>(key: string, value: T) {
      await pgReady;
      await sql`
        INSERT INTO afd_kv (key, value, updated_at)
        VALUES (${key}, ${JSON.stringify(value)}::jsonb, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `;
    },
  };
}

/* ---------- Upstash ---------- */

function redisKV(url: string, token: string): KV {
  const redis = new Redis({ url, token });
  return {
    kind: "redis",
    async get<T>(key: string) {
      return (await redis.get<T>(key)) ?? null;
    },
    async set<T>(key: string, value: T) {
      await redis.set(key, value);
    },
  };
}

/* ---------- Selection + seeding ---------- */

let kvInstance: KV | null = null;

function kv(): KV {
  if (kvInstance) return kvInstance;
  const pg = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const ru = process.env.UPSTASH_REDIS_REST_URL;
  const rt = process.env.UPSTASH_REDIS_REST_TOKEN;
  kvInstance = pg
    ? postgresKV(pg)
    : ru && rt
      ? redisKV(ru, rt)
      : memoryKV();
  return kvInstance;
}

let seeded: Promise<void> | null = null;

/**
 * Seed once per SEED_VERSION. Bumping SEED_VERSION re-seeds the handbook and
 * settings (so prompt/data fixes ship) but preserves the live question log
 * and notifications, which are real demo state.
 */
function ensureSeeded(): Promise<void> {
  if (seeded) return seeded;
  seeded = (async () => {
    const store = kv();
    const version = await store.get<string>(KEYS.seedVersion);
    if (version === SEED_VERSION) return;
    await store.set(KEYS.entries, seedEntries);
    await store.set(KEYS.settings, seedSettings);
    const existingQ = await store.get<QuestionLog[]>(KEYS.questions);
    if (!existingQ || existingQ.length === 0) {
      await store.set(KEYS.questions, seedQuestions);
    }
    if (!(await store.get(KEYS.notifications))) {
      await store.set(KEYS.notifications, []);
    }
    await store.set(KEYS.seedVersion, SEED_VERSION);
  })();
  return seeded;
}

export function storeKind(): KV["kind"] {
  return kv().kind;
}

/* ---------- Entries ---------- */

export async function getEntries(): Promise<HandbookEntry[]> {
  await ensureSeeded();
  return (await kv().get<HandbookEntry[]>(KEYS.entries)) ?? [];
}

export function isEffective(e: HandbookEntry, onDate: string): boolean {
  if (e.effectiveFrom && onDate < e.effectiveFrom) return false;
  if (e.effectiveUntil && onDate > e.effectiveUntil) return false;
  return true;
}

/** Published entries that are in effect on the given YYYY-MM-DD date. */
export async function getPublishedEntries(
  onDate?: string
): Promise<HandbookEntry[]> {
  const entries = await getEntries();
  const d = onDate ?? new Date().toISOString().slice(0, 10);
  return entries.filter((e) => e.status === "published" && isEffective(e, d));
}

export async function saveEntries(entries: HandbookEntry[]): Promise<void> {
  await ensureSeeded();
  await kv().set(KEYS.entries, entries);
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

/* ---------- Questions ---------- */

export async function getQuestions(): Promise<QuestionLog[]> {
  await ensureSeeded();
  return (await kv().get<QuestionLog[]>(KEYS.questions)) ?? [];
}

export async function saveQuestions(questions: QuestionLog[]): Promise<void> {
  await ensureSeeded();
  // Keep the log bounded for the prototype.
  await kv().set(KEYS.questions, questions.slice(0, 500));
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

/** Mark every open question in an intent cluster resolved at once. */
export async function resolveIntent(
  intent: string,
  resolvedEntryId?: string
): Promise<number> {
  const questions = await getQuestions();
  let n = 0;
  for (const q of questions) {
    if (q.intent === intent && !q.resolved) {
      q.resolved = true;
      if (resolvedEntryId) q.resolvedEntryId = resolvedEntryId;
      n++;
    }
  }
  await saveQuestions(questions);
  return n;
}

/* ---------- Settings ---------- */

export async function getSettings(): Promise<Settings> {
  await ensureSeeded();
  return (await kv().get<Settings>(KEYS.settings)) ?? seedSettings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await ensureSeeded();
  await kv().set(KEYS.settings, settings);
}

/* ---------- Staff notifications ---------- */

export async function getNotifications(): Promise<StaffNotification[]> {
  await ensureSeeded();
  return (await kv().get<StaffNotification[]>(KEYS.notifications)) ?? [];
}

export async function addNotification(
  n: StaffNotification
): Promise<StaffNotification> {
  const list = await getNotifications();
  list.unshift(n);
  await kv().set(KEYS.notifications, list.slice(0, 200));
  return n;
}

export async function acknowledgeNotification(id: string): Promise<void> {
  const list = await getNotifications();
  const n = list.find((x) => x.id === id);
  if (n) n.acknowledged = true;
  await kv().set(KEYS.notifications, list);
}
