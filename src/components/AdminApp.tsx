"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AskResult,
  HandbookEntry,
  IntentCluster,
  QuestionLog,
  Settings,
  StaffNotification,
  Stats,
} from "@/lib/types";

type Tab = "inbox" | "handbook" | "alerts" | "settings";

const CATEGORIES = [
  "Hours & Closures",
  "Tuition & Billing",
  "Health & Illness",
  "Meals",
  "Enrollment & Tours",
  "Daily Schedule",
  "Drop-off & Pickup",
  "Weather",
];

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function AdminApp() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [questions, setQuestions] = useState<QuestionLog[]>([]);
  const [clusters, setClusters] = useState<IntentCluster[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [entries, setEntries] = useState<HandbookEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [storeKind, setStoreKind] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [qRes, eRes, sRes, nRes] = await Promise.all([
      fetch("/api/questions").then((r) => r.json()),
      fetch("/api/entries").then(async (r) => {
        setStoreKind(r.headers.get("x-store") || "");
        return r.json();
      }),
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/notifications").then((r) => r.json()),
    ]);
    setQuestions(qRes.questions);
    setClusters(qRes.clusters);
    setStats(qRes.stats);
    setEntries(eRes);
    setSettings(sRes);
    setNotifications(nRes);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Defer so the initial fetch is not a synchronous setState inside the effect body.
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const unacked = notifications.filter((n) => !n.acknowledged).length;

  if (loading || !stats || !settings) {
    return <div className="flex min-h-full items-center justify-center text-ink-muted">Loading control center…</div>;
  }

  return (
    <div className="mx-auto min-h-full max-w-5xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-leaf">Operator</div>
          <h1 className="text-3xl font-semibold tracking-tight">Control Center</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {settings.centerName} · source of truth & improvement loop
            {storeKind && (
              <span className="ml-2 rounded-md bg-bg-soft px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                {storeKind === "memory" ? "in-memory (demo)" : `${storeKind} · persistent`}
              </span>
            )}
          </p>
        </div>
        <Link href="/" className="rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink-muted hover:text-ink">
          ← Parent view
        </Link>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Questions (7d)" value={String(stats.questionsThisWeek)} />
        <Stat label="Auto-answered" value={`${stats.autoAnsweredPct}%`} />
        <Stat
          label="Hours saved (7d)"
          value={`${stats.hoursSavedThisWeek}h`}
          hint={`${stats.minutesPerQuestion} min per answered inquiry`}
          highlight
        />
        <Stat label="Escalated" value={String(stats.escalated)} />
        <Stat label="Open gaps" value={String(stats.openGaps)} accent />
      </section>

      {stats.topTopics.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {stats.topTopics.map((t) => (
            <span key={t.topic} className="rounded-full border border-line bg-card px-3 py-1 text-xs text-ink-muted">
              {t.topic} · {t.count}
            </span>
          ))}
        </div>
      )}

      <nav className="mb-4 flex gap-1 rounded-2xl border border-line bg-card p-1">
        {(
          [
            ["inbox", `Needs attention (${clusters.length})`],
            ["handbook", "Handbook"],
            ["alerts", `Staff alerts${unacked ? ` (${unacked})` : ""}`],
            ["settings", "Settings"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 rounded-xl px-2 py-2 text-xs font-medium transition sm:text-sm ${
              tab === id ? "bg-leaf text-white" : "text-ink-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "inbox" && (
        <Inbox
          clusters={clusters}
          entries={entries}
          onResolved={refresh}
          onEditEntry={(id) => {
            setEditEntryId(id);
            setTab("handbook");
          }}
        />
      )}
      {tab === "handbook" && (
        <HandbookEditor
          key={editEntryId ?? "none"}
          entries={entries}
          onChange={refresh}
          initialEditing={entries.find((e) => e.id === editEntryId) ?? null}
          onEditorClosed={() => setEditEntryId(null)}
        />
      )}
      {tab === "alerts" && <Alerts items={notifications} questions={questions} onChange={refresh} />}
      {tab === "settings" && <SettingsPanel settings={settings} onSaved={refresh} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Stat({
  label,
  value,
  hint,
  accent,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 shadow-sm ${
        accent ? "border-sun/40 bg-sun-soft/30" : highlight ? "border-leaf/40 bg-leaf/5" : "border-line bg-card"
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-ink-muted">{hint}</div>}
    </div>
  );
}

const OUTCOME_LABEL: Record<string, string> = {
  gap: "Gap",
  escalation: "Escalated",
  stale_flag: "Flagged outdated",
  answered: "Thumbs down",
  clarify: "Clarified",
};

function StruggleDetail({ q }: { q: QuestionLog }) {
  return (
    <div className="rounded-xl bg-bg-soft/60 px-3 py-2 text-xs leading-relaxed text-ink-muted">
      <div className="text-ink">“{q.question}”</div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        <span>{fmtWhen(q.askedAt)}</span>
        {q.channel && <span>via {q.channel}</span>}
        {q.confidence && <span>confidence: {q.confidence}</span>}
        {q.promptVersion && <span className="font-mono">{q.promptVersion}</span>}
      </div>
      {q.reason && (
        <div className="mt-1">
          <span className="font-medium text-ink">Why it struggled:</span> {q.reason}
        </div>
      )}
      {q.rejectedCitationIds && q.rejectedCitationIds.length > 0 && (
        <div className="mt-1 text-rose">
          Model cited entries that don’t exist: {q.rejectedCitationIds.join(", ")} (rejected by the server)
        </div>
      )}
      {q.feedback === "down" && q.answerPreview && (
        <div className="mt-1">
          <span className="font-medium text-ink">Parent said “not quite” to:</span> “{q.answerPreview}”
        </div>
      )}
    </div>
  );
}

function Inbox({
  clusters,
  entries,
  onResolved,
  onEditEntry,
}: {
  clusters: IntentCluster[];
  entries: HandbookEntry[];
  onResolved: () => void;
  onEditEntry: (entryId: string) => void;
}) {
  const [active, setActive] = useState<IntentCluster | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (clusters.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-card px-6 py-10 text-center text-sm text-ink-muted">
        Inbox clear — no open gaps, escalations, or flags.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="mb-3 text-xs text-ink-muted">
        Grouped by what parents are really asking. Answer once and every open question in the group is resolved.
      </p>
      {clusters.map((c) => {
        const first = c.items[0];
        const flagged = first.flaggedEntryId ? entries.find((e) => e.id === first.flaggedEntryId) : null;
        const isOpen = expanded === c.intent;
        return (
          <div key={c.intent} className="rounded-2xl border border-line bg-card shadow-sm">
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpanded(isOpen ? null : c.intent)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">
                    {c.outcome === "stale_flag" && flagged ? `Outdated? “${flagged.title}”` : c.label}
                  </span>
                  {c.count > 1 && (
                    <span className="rounded-full bg-leaf px-2 py-0.5 text-[11px] font-semibold text-white">
                      ×{c.count}
                    </span>
                  )}
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                      c.outcome === "escalation"
                        ? "bg-rose-soft text-rose"
                        : c.outcome === "stale_flag"
                          ? "bg-sun-soft text-ink"
                          : "bg-bg-soft text-ink-muted"
                    }`}
                  >
                    {OUTCOME_LABEL[c.outcome] ?? c.outcome}
                  </span>
                </div>
                <div className="mt-1 truncate text-xs text-ink-muted">
                  “{first.question}” · {c.topic} · last {fmtWhen(c.lastAskedAt)}
                </div>
                {!isOpen && first.reason && (
                  <div className="mt-1 line-clamp-1 text-xs text-ink-muted">
                    <span className="font-medium text-ink">Why:</span> {first.reason}
                  </div>
                )}
              </button>
              <div className="flex shrink-0 flex-col gap-1">
                {c.outcome === "stale_flag" && flagged ? (
                  <button
                    type="button"
                    onClick={() => onEditEntry(flagged.id)}
                    className="rounded-lg bg-leaf px-2 py-1 text-xs font-medium text-white"
                  >
                    Review entry
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActive(c)}
                    className="rounded-lg bg-leaf px-2 py-1 text-xs font-medium text-white"
                  >
                    {c.outcome === "escalation" ? "Handle" : "Answer & add"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : c.intent)}
                  className="rounded-lg border border-line px-2 py-1 text-xs text-ink-muted"
                >
                  {isOpen ? "Hide" : "Details"}
                </button>
              </div>
            </div>
            {isOpen && (
              <div className="space-y-2 border-t border-line px-4 py-3">
                {c.items.map((q) => (
                  <StruggleDetail key={q.id} q={q} />
                ))}
                {c.outcome === "stale_flag" && (
                  <ResolveOnly
                    intent={c.intent}
                    onDone={onResolved}
                    label="Entry is still correct — dismiss"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {active && (
        <GapModal
          cluster={active}
          onClose={() => setActive(null)}
          onDone={() => {
            setActive(null);
            onResolved();
          }}
        />
      )}
    </div>
  );
}

function ResolveOnly({ intent, onDone, label }: { intent: string; onDone: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/questions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolveIntent: intent }),
        });
        onDone();
      }}
      className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */

function GapModal({ cluster, onClose, onDone }: { cluster: IntentCluster; onClose: () => void; onDone: () => void }) {
  const primary = cluster.items[0];
  const [quick, setQuick] = useState("");
  const [draft, setDraft] = useState({ title: "", category: "Tuition & Billing", content: "" });
  const [step, setStep] = useState<"answer" | "edit" | "test">("answer");
  const [busy, setBusy] = useState(false);
  const [testQ, setTestQ] = useState(primary.question);
  const [testResult, setTestResult] = useState<AskResult | null>(null);
  const [error, setError] = useState("");

  async function draftEntry() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/draft-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: primary.question,
          operatorAnswer: quick,
          relatedQuestions: cluster.items.slice(1).map((q) => q.question),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft failed");
      setDraft({ title: data.title, category: data.category, content: data.content });
      setStep("edit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, status: "published", updatedBy: "Staff" }),
      });
      const entry = await res.json();
      if (!res.ok) throw new Error(entry.error || "Publish failed");
      await fetch("/api/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolveIntent: cluster.intent, resolvedEntryId: entry.id }),
      });
      setStep("test");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  async function markResolvedOnly() {
    await fetch("/api/questions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolveIntent: cluster.intent }),
    });
    onDone();
  }

  async function runTest() {
    setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: testQ, channel: "admin-test" }),
      });
      setTestResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-card p-5 shadow-[var(--shadow)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">
              {step === "answer" && "1 · Quick answer"}
              {step === "edit" && "2 · Edit handbook entry"}
              {step === "test" && "3 · Test it"}
            </div>
            <h3 className="text-lg font-semibold">{cluster.label}</h3>
            <p className="mt-1 text-xs text-ink-muted">
              {cluster.count === 1
                ? `“${primary.question}”`
                : `${cluster.count} parents asked this, e.g. “${primary.question}”`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink">
            ✕
          </button>
        </div>

        {step === "answer" && (
          <div className="mb-3 space-y-1.5">
            {cluster.items.slice(0, 3).map((q) => (
              <StruggleDetail key={q.id} q={q} />
            ))}
          </div>
        )}

        {cluster.outcome === "escalation" && step === "answer" && (
          <div className="mb-4 rounded-xl border border-rose/30 bg-rose-soft/40 px-3 py-2 text-sm text-ink">
            This was escalated and staff were alerted. Resolve after handling it directly, or add a handbook
            note if a general policy would help future parents.
          </div>
        )}

        {error && <div className="mb-3 rounded-xl bg-rose-soft/50 px-3 py-2 text-sm text-rose">{error}</div>}

        {step === "answer" && (
          <>
            <textarea
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              rows={4}
              placeholder="Type the answer you'd give the parent…"
              className="w-full rounded-2xl border border-line bg-bg-soft/40 px-3 py-2 text-sm outline-none focus:border-leaf"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!quick.trim() || busy}
                onClick={draftEntry}
                className="rounded-xl bg-leaf px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {busy ? "Drafting…" : "Draft handbook entry"}
              </button>
              <button type="button" onClick={markResolvedOnly} className="rounded-xl border border-line px-4 py-2 text-sm text-ink-muted">
                Resolve {cluster.count > 1 ? `all ${cluster.count}` : ""} without adding
              </button>
            </div>
          </>
        )}

        {step === "edit" && (
          <>
            <label className="mb-2 block text-xs text-ink-muted">Title</label>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="mb-3 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-leaf"
            />
            <label className="mb-2 block text-xs text-ink-muted">Category</label>
            <select
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              className="mb-3 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <label className="mb-2 block text-xs text-ink-muted">Content</label>
            <textarea
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              rows={5}
              className="w-full rounded-2xl border border-line px-3 py-2 text-sm outline-none focus:border-leaf"
            />
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={busy} onClick={publish} className="rounded-xl bg-leaf px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
                {busy ? "Publishing…" : `Publish & resolve ${cluster.count > 1 ? `${cluster.count} questions` : ""}`}
              </button>
              <button type="button" onClick={() => setStep("answer")} className="rounded-xl border border-line px-4 py-2 text-sm">
                Back
              </button>
            </div>
          </>
        )}

        {step === "test" && (
          <>
            <p className="mb-3 text-sm text-ink-muted">
              Entry published and {cluster.count} question{cluster.count > 1 ? "s" : ""} resolved. Re-ask to confirm the Front Desk can answer it now.
            </p>
            <input
              value={testQ}
              onChange={(e) => setTestQ(e.target.value)}
              className="mb-2 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-leaf"
            />
            <button type="button" disabled={busy} onClick={runTest} className="rounded-xl bg-leaf px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
              {busy ? "Asking…" : "Test it"}
            </button>
            {testResult && (
              <div className="mt-3 rounded-2xl border border-line bg-bg-soft/50 px-3 py-3 text-sm">
                <div className="mb-1 text-[11px] uppercase tracking-wider text-ink-muted">
                  {testResult.outcome}
                  {testResult.confidence ? ` · ${testResult.confidence}` : ""}
                </div>
                <p>{testResult.answer}</p>
                {testResult.citedEntries.length > 0 && (
                  <ul className="mt-2 list-disc pl-4 text-xs text-ink-muted">
                    {testResult.citedEntries.map((e) => (
                      <li key={e.id}>{e.title}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <button type="button" onClick={onDone} className="mt-4 rounded-xl border border-line px-4 py-2 text-sm">
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function freshness(e: HandbookEntry): { label: string; stale: boolean } | null {
  if (!e.reviewEveryDays) return null;
  const age = Math.floor((Date.now() - new Date(e.updatedAt).getTime()) / 86_400_000);
  return age > e.reviewEveryDays
    ? { label: `Stale: ${age}d old, reviews every ${e.reviewEveryDays}d`, stale: true }
    : { label: `Fresh: ${age}d old / ${e.reviewEveryDays}d`, stale: false };
}

function HandbookEditor({
  entries,
  onChange,
  initialEditing,
  onEditorClosed,
}: {
  entries: HandbookEntry[];
  onChange: () => void;
  initialEditing: HandbookEntry | null;
  onEditorClosed: () => void;
}) {
  const [editing, setEditingState] = useState<HandbookEntry | null>(initialEditing);
  const [testQ, setTestQ] = useState("");
  const [testResult, setTestResult] = useState<AskResult | null>(null);
  const [busy, setBusy] = useState(false);

  const setEditing = (e: HandbookEntry | null) => {
    setEditingState(e);
    if (e === null && initialEditing) onEditorClosed();
  };

  const byCategory = useMemo(() => {
    const map = new Map<string, HandbookEntry[]>();
    for (const e of entries) {
      const list = map.get(e.category) || [];
      list.push(e);
      map.set(e.category, list);
    }
    return [...map.entries()];
  }, [entries]);

  async function save(entry: HandbookEntry) {
    setBusy(true);
    await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    setBusy(false);
    setEditing(null);
    onChange();
  }

  async function toggleStatus(entry: HandbookEntry) {
    await save({ ...entry, status: entry.status === "published" ? "draft" : "published" });
  }

  async function runTest() {
    if (!testQ.trim()) return;
    setBusy(true);
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: testQ, channel: "admin-test" }),
    });
    setTestResult(await res.json());
    setBusy(false);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-5">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() =>
              setEditing({
                id: "",
                title: "",
                category: "Hours & Closures",
                content: "",
                status: "published",
                updatedAt: new Date().toISOString(),
                updatedBy: "Staff",
              })
            }
            className="rounded-xl bg-leaf px-3 py-2 text-sm font-medium text-white"
          >
            + New entry
          </button>
        </div>
        {byCategory.map(([cat, list]) => (
          <div key={cat}>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-muted">{cat}</h2>
            <div className="space-y-2">
              {list.map((e) => {
                const f = freshness(e);
                const expired = e.effectiveUntil && e.effectiveUntil < today;
                const notYet = e.effectiveFrom && e.effectiveFrom > today;
                return (
                  <div key={e.id} className="rounded-2xl border border-line bg-card px-4 py-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-ink">{e.title}</div>
                        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-ink-muted">
                          <span>{e.status}</span>
                          <span>· updated {new Date(e.updatedAt).toLocaleDateString()}</span>
                          {(e.effectiveFrom || e.effectiveUntil) && (
                            <span>
                              · in effect {e.effectiveFrom ?? "…"} → {e.effectiveUntil ?? "…"}
                            </span>
                          )}
                          {f && (
                            <span className={f.stale ? "rounded bg-sun-soft px-1 text-ink" : ""}>· {f.label}</span>
                          )}
                          {(expired || notYet) && (
                            <span className="rounded bg-rose-soft px-1 text-rose">
                              · {expired ? "expired, not used" : "not yet in effect"}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => setEditing(e)} className="rounded-lg border border-line px-2 py-1 text-xs">
                          Edit
                        </button>
                        <button type="button" onClick={() => toggleStatus(e)} className="rounded-lg border border-line px-2 py-1 text-xs">
                          {e.status === "published" ? "Unpublish" : "Publish"}
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{e.content}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <aside className="h-fit rounded-2xl border border-line bg-card p-4 shadow-sm lg:sticky lg:top-4">
        <h3 className="text-sm font-semibold">Test a question</h3>
        <p className="mt-1 text-xs text-ink-muted">Ask against the live published handbook.</p>
        <textarea
          value={testQ}
          onChange={(e) => setTestQ(e.target.value)}
          rows={3}
          className="mt-3 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-leaf"
          placeholder="e.g. Are you open on Veterans Day?"
        />
        <button type="button" disabled={busy} onClick={runTest} className="mt-2 w-full rounded-xl bg-leaf px-3 py-2 text-sm font-medium text-white disabled:opacity-40">
          Ask
        </button>
        {testResult && (
          <div className="mt-3 rounded-xl bg-bg-soft/60 px-3 py-2 text-xs leading-relaxed">
            <div className="mb-1 font-medium uppercase tracking-wider text-ink-muted">
              {testResult.outcome}
              {testResult.promptVersion ? ` · ${testResult.promptVersion}` : ""}
            </div>
            {testResult.answer}
            {testResult.caveats?.map((c) => (
              <div key={c} className="mt-1 text-ink">
                ⚠ {c}
              </div>
            ))}
          </div>
        )}
      </aside>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-card p-5 shadow-[var(--shadow)]">
            <h3 className="mb-3 text-lg font-semibold">{editing.id ? "Edit entry" : "New entry"}</h3>
            <input
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              placeholder="Title"
              className="mb-2 w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
            <select
              value={editing.category}
              onChange={(e) => setEditing({ ...editing, category: e.target.value })}
              className="mb-2 w-full rounded-xl border border-line px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <textarea
              value={editing.content}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              rows={6}
              className="mb-3 w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
            <div className="mb-3 grid grid-cols-3 gap-2">
              <label className="text-xs text-ink-muted">
                In effect from
                <input
                  type="date"
                  value={editing.effectiveFrom ?? ""}
                  onChange={(e) => setEditing({ ...editing, effectiveFrom: e.target.value || undefined })}
                  className="mt-1 w-full rounded-xl border border-line px-2 py-1.5 text-sm text-ink"
                />
              </label>
              <label className="text-xs text-ink-muted">
                Until
                <input
                  type="date"
                  value={editing.effectiveUntil ?? ""}
                  onChange={(e) => setEditing({ ...editing, effectiveUntil: e.target.value || undefined })}
                  className="mt-1 w-full rounded-xl border border-line px-2 py-1.5 text-sm text-ink"
                />
              </label>
              <label className="text-xs text-ink-muted">
                Changes every (days)
                <input
                  type="number"
                  min={1}
                  placeholder="e.g. 7"
                  value={editing.reviewEveryDays ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, reviewEveryDays: e.target.value ? Number(e.target.value) : undefined })
                  }
                  className="mt-1 w-full rounded-xl border border-line px-2 py-1.5 text-sm text-ink"
                />
              </label>
            </div>
            <p className="mb-3 text-[11px] text-ink-muted">
              Expired entries are excluded from answers. “Changes every” adds a confirm-with-office caveat once the entry is older than that.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !editing.title || !editing.content}
                onClick={() => save({ ...editing, updatedBy: "Staff" })}
                className="rounded-xl bg-leaf px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Save
              </button>
              <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-line px-4 py-2 text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Alerts({
  items,
  questions,
  onChange,
}: {
  items: StaffNotification[];
  questions: QuestionLog[];
  onChange: () => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-card px-6 py-10 text-center text-sm text-ink-muted">
        No staff alerts yet. Escalated parent messages show up here (and are emailed when RESEND_API_KEY is set).
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="mb-3 text-xs text-ink-muted">
        Every escalation pings staff automatically and tells the parent so — they never have to repeat themselves.
      </p>
      {items.map((n) => {
        const q = questions.find((x) => x.id === n.questionId);
        return (
          <div
            key={n.id}
            className={`rounded-2xl border px-4 py-3 shadow-sm ${n.acknowledged ? "border-line bg-card opacity-70" : "border-rose/30 bg-rose-soft/30"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-ink">“{n.question}”</div>
                <div className="mt-1 text-xs text-ink-muted">
                  {n.topic} · via {n.channel} · {fmtWhen(n.createdAt)} · delivered by {n.via === "email" ? "email" : "control center"}
                </div>
                {q?.reason && <div className="mt-1 text-xs text-ink-muted">{q.reason}</div>}
              </div>
              {!n.acknowledged && (
                <button
                  type="button"
                  onClick={async () => {
                    await fetch("/api/notifications", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: n.id }),
                    });
                    onChange();
                  }}
                  className="shrink-0 rounded-lg bg-leaf px-2 py-1 text-xs font-medium text-white"
                >
                  I’ve got it
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SettingsPanel({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [form, setForm] = useState(settings);
  const [topicsText, setTopicsText] = useState(settings.sensitiveTopics.join("\n"));
  const [saved, setSaved] = useState(false);

  async function save() {
    const next: Settings = {
      ...form,
      sensitiveTopics: topicsText.split("\n").map((t) => t.trim()).filter(Boolean),
    };
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setSaved(true);
    onSaved();
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-xl space-y-4 rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div>
        <label className="text-xs text-ink-muted">Center name</label>
        <input
          value={form.centerName}
          onChange={(e) => setForm({ ...form, centerName: e.target.value })}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["name", "phone", "email"] as const).map((k) => (
          <div key={k}>
            <label className="text-xs capitalize text-ink-muted">{k === "name" ? "Director" : k}</label>
            <input
              value={form.director[k]}
              onChange={(e) => setForm({ ...form, director: { ...form.director, [k]: e.target.value } })}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>
      <div>
        <label className="text-xs text-ink-muted">
          Situations that need a human (one per line). Describe the situation, not a keyword — the classifier uses these as guidance.
        </label>
        <textarea
          value={topicsText}
          onChange={(e) => setTopicsText(e.target.value)}
          rows={9}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
        />
      </div>
      <button type="button" onClick={save} className="rounded-xl bg-leaf px-4 py-2 text-sm font-medium text-white">
        {saved ? "Saved" : "Save settings"}
      </button>
      <p className="text-xs text-ink-muted">
        Prototype note: /admin has no auth. In production this would sit behind center staff SSO.
      </p>
    </div>
  );
}
