"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AskResult,
  HandbookEntry,
  QuestionLog,
  Settings,
  Stats,
} from "@/lib/types";

type Tab = "inbox" | "handbook" | "settings";

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

export default function AdminApp() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [questions, setQuestions] = useState<QuestionLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [entries, setEntries] = useState<HandbookEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [qRes, eRes, sRes] = await Promise.all([
      fetch("/api/questions").then((r) => r.json()),
      fetch("/api/entries").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]);
    setQuestions(qRes.questions);
    setStats(qRes.stats);
    setEntries(eRes);
    setSettings(sRes);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const inbox = useMemo(
    () =>
      questions.filter(
        (q) =>
          !q.resolved &&
          (q.outcome === "gap" ||
            q.outcome === "escalation" ||
            q.feedback === "down" ||
            q.outcome === "thumbs_down")
      ),
    [questions]
  );

  if (loading || !stats || !settings) {
    return (
      <div className="flex min-h-full items-center justify-center text-ink-muted">
        Loading control center…
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-full max-w-5xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-leaf">
            Operator
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Control Center
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {settings.centerName} · source of truth & improvement loop
          </p>
        </div>
        <a
          href="/"
          className="rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink-muted hover:text-ink"
        >
          ← Parent view
        </a>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Questions (7d)" value={String(stats.questionsThisWeek)} />
        <Stat label="Auto-answered" value={`${stats.autoAnsweredPct}%`} />
        <Stat label="Escalated" value={String(stats.escalated)} />
        <Stat label="Open gaps" value={String(stats.openGaps)} accent />
      </section>

      {stats.topTopics.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {stats.topTopics.map((t) => (
            <span
              key={t.topic}
              className="rounded-full border border-line bg-card px-3 py-1 text-xs text-ink-muted"
            >
              {t.topic} · {t.count}
            </span>
          ))}
        </div>
      )}

      <nav className="mb-4 flex gap-1 rounded-2xl border border-line bg-card p-1">
        {(
          [
            ["inbox", `Needs attention (${inbox.length})`],
            ["handbook", "Handbook"],
            ["settings", "Settings"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
              tab === id
                ? "bg-leaf text-white"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "inbox" && (
        <Inbox
          items={inbox}
          onResolved={refresh}
        />
      )}
      {tab === "handbook" && (
        <HandbookEditor entries={entries} onChange={refresh} />
      )}
      {tab === "settings" && (
        <SettingsPanel settings={settings} onSaved={refresh} />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 shadow-sm ${
        accent
          ? "border-sun/40 bg-sun-soft/30"
          : "border-line bg-card"
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
    </div>
  );
}

function Inbox({
  items,
  onResolved,
}: {
  items: QuestionLog[];
  onResolved: () => void;
}) {
  const [active, setActive] = useState<QuestionLog | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-card px-6 py-10 text-center text-sm text-ink-muted">
        Inbox clear — no open gaps or escalations.
      </div>
    );
  }

  const grouped = items.reduce<Record<string, QuestionLog[]>>((acc, q) => {
    const key = q.topic || "Other";
    (acc[key] ||= []).push(q);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {Object.entries(grouped).map(([topic, qs]) => (
        <div key={topic}>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-muted">
            {topic}
          </h2>
          <div className="space-y-2">
            {qs.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setActive(q)}
                className="flex w-full items-start justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-left shadow-sm transition hover:border-leaf"
              >
                <div>
                  <div className="text-sm font-medium text-ink">
                    {q.question}
                  </div>
                  <div className="mt-1 text-xs text-ink-muted">
                    {new Date(q.askedAt).toLocaleString()} · {q.outcome}
                    {q.escalationReason ? ` — ${q.escalationReason}` : ""}
                  </div>
                </div>
                <span className="shrink-0 rounded-lg bg-leaf/10 px-2 py-1 text-xs font-medium text-leaf-deep">
                  {q.outcome === "escalation" ? "Review" : "Answer & add"}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {active && (
        <GapModal
          question={active}
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

function GapModal({
  question,
  onClose,
  onDone,
}: {
  question: QuestionLog;
  onClose: () => void;
  onDone: () => void;
}) {
  const [quick, setQuick] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    category: "Tuition & Billing",
    content: "",
  });
  const [step, setStep] = useState<"answer" | "edit" | "test">("answer");
  const [busy, setBusy] = useState(false);
  const [testQ, setTestQ] = useState(question.question);
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
          question: question.question,
          operatorAnswer: quick,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft failed");
      setDraft({
        title: data.title,
        category: data.category,
        content: data.content,
      });
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
        body: JSON.stringify({
          ...draft,
          status: "published",
          updatedBy: "Staff",
        }),
      });
      const entry = await res.json();
      if (!res.ok) throw new Error(entry.error || "Publish failed");
      await fetch("/api/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: question.id,
          resolved: true,
          resolvedEntryId: entry.id,
        }),
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
      body: JSON.stringify({ id: question.id, resolved: true }),
    });
    onDone();
  }

  async function runTest() {
    setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: testQ }),
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
            <h3 className="text-lg font-semibold">{question.question}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-muted hover:text-ink"
          >
            ✕
          </button>
        </div>

        {question.outcome === "escalation" && step === "answer" && (
          <div className="mb-4 rounded-xl border border-rose/30 bg-rose-soft/40 px-3 py-2 text-sm text-ink">
            Escalation: {question.escalationReason}. You can resolve after
            handling offline, or still add a handbook note if appropriate.
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-xl bg-rose-soft/50 px-3 py-2 text-sm text-rose">
            {error}
          </div>
        )}

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
              <button
                type="button"
                onClick={markResolvedOnly}
                className="rounded-xl border border-line px-4 py-2 text-sm text-ink-muted"
              >
                Resolve without adding
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
              <button
                type="button"
                disabled={busy}
                onClick={publish}
                className="rounded-xl bg-leaf px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {busy ? "Publishing…" : "Publish & continue"}
              </button>
              <button
                type="button"
                onClick={() => setStep("answer")}
                className="rounded-xl border border-line px-4 py-2 text-sm"
              >
                Back
              </button>
            </div>
          </>
        )}

        {step === "test" && (
          <>
            <p className="mb-3 text-sm text-ink-muted">
              Entry published. Re-ask the question to confirm the Front Desk
              can answer it now.
            </p>
            <input
              value={testQ}
              onChange={(e) => setTestQ(e.target.value)}
              className="mb-2 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-leaf"
            />
            <button
              type="button"
              disabled={busy}
              onClick={runTest}
              className="rounded-xl bg-leaf px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? "Asking…" : "Test it"}
            </button>
            {testResult && (
              <div className="mt-3 rounded-2xl border border-line bg-bg-soft/50 px-3 py-3 text-sm">
                <div className="mb-1 text-[11px] uppercase tracking-wider text-ink-muted">
                  {testResult.outcome}
                  {testResult.confidence
                    ? ` · ${testResult.confidence}`
                    : ""}
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
            <button
              type="button"
              onClick={onDone}
              className="mt-4 rounded-xl border border-line px-4 py-2 text-sm"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function HandbookEditor({
  entries,
  onChange,
}: {
  entries: HandbookEntry[];
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<HandbookEntry | null>(null);
  const [testQ, setTestQ] = useState("");
  const [testResult, setTestResult] = useState<AskResult | null>(null);
  const [busy, setBusy] = useState(false);

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
    await save({
      ...entry,
      status: entry.status === "published" ? "draft" : "published",
      updatedAt: new Date().toISOString(),
    });
  }

  async function runTest() {
    if (!testQ.trim()) return;
    setBusy(true);
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: testQ }),
    });
    setTestResult(await res.json());
    setBusy(false);
  }

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
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-muted">
              {cat}
            </h2>
            <div className="space-y-2">
              {list.map((e) => (
                <div
                  key={e.id}
                  className="rounded-2xl border border-line bg-card px-4 py-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-ink">{e.title}</div>
                      <div className="mt-1 text-xs text-ink-muted">
                        {e.status} · updated{" "}
                        {new Date(e.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(e)}
                        className="rounded-lg border border-line px-2 py-1 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus(e)}
                        className="rounded-lg border border-line px-2 py-1 text-xs"
                      >
                        {e.status === "published" ? "Unpublish" : "Publish"}
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-ink-muted">
                    {e.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <aside className="h-fit rounded-2xl border border-line bg-card p-4 shadow-sm lg:sticky lg:top-4">
        <h3 className="text-sm font-semibold">Test a question</h3>
        <p className="mt-1 text-xs text-ink-muted">
          Ask against the live published handbook.
        </p>
        <textarea
          value={testQ}
          onChange={(e) => setTestQ(e.target.value)}
          rows={3}
          className="mt-3 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-leaf"
          placeholder="e.g. Are you open on Veterans Day?"
        />
        <button
          type="button"
          disabled={busy}
          onClick={runTest}
          className="mt-2 w-full rounded-xl bg-leaf px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Ask
        </button>
        {testResult && (
          <div className="mt-3 rounded-xl bg-bg-soft/60 px-3 py-2 text-xs leading-relaxed">
            <div className="mb-1 font-medium uppercase tracking-wider text-ink-muted">
              {testResult.outcome}
            </div>
            {testResult.answer}
          </div>
        )}
      </aside>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-line bg-card p-5 shadow-[var(--shadow)]">
            <h3 className="mb-3 text-lg font-semibold">
              {editing.id ? "Edit entry" : "New entry"}
            </h3>
            <input
              value={editing.title}
              onChange={(e) =>
                setEditing({ ...editing, title: e.target.value })
              }
              placeholder="Title"
              className="mb-2 w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
            <select
              value={editing.category}
              onChange={(e) =>
                setEditing({ ...editing, category: e.target.value })
              }
              className="mb-2 w-full rounded-xl border border-line px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <textarea
              value={editing.content}
              onChange={(e) =>
                setEditing({ ...editing, content: e.target.value })
              }
              rows={6}
              className="mb-3 w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !editing.title || !editing.content}
                onClick={() =>
                  save({
                    ...editing,
                    updatedAt: new Date().toISOString(),
                    updatedBy: "Staff",
                  })
                }
                className="rounded-xl bg-leaf px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-xl border border-line px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsPanel({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(settings);
  const [topicsText, setTopicsText] = useState(
    settings.sensitiveTopics.join("\n")
  );
  const [saved, setSaved] = useState(false);

  async function save() {
    const next: Settings = {
      ...form,
      sensitiveTopics: topicsText
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean),
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
        <div>
          <label className="text-xs text-ink-muted">Director</label>
          <input
            value={form.director.name}
            onChange={(e) =>
              setForm({
                ...form,
                director: { ...form.director, name: e.target.value },
              })
            }
            className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-ink-muted">Phone</label>
          <input
            value={form.director.phone}
            onChange={(e) =>
              setForm({
                ...form,
                director: { ...form.director, phone: e.target.value },
              })
            }
            className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-ink-muted">Email</label>
          <input
            value={form.director.email}
            onChange={(e) =>
              setForm({
                ...form,
                director: { ...form.director, email: e.target.value },
              })
            }
            className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-ink-muted">
          Sensitive topics (one per line) — these escalate instead of answering
        </label>
        <textarea
          value={topicsText}
          onChange={(e) => setTopicsText(e.target.value)}
          rows={8}
          className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
        />
      </div>
      <button
        type="button"
        onClick={save}
        className="rounded-xl bg-leaf px-4 py-2 text-sm font-medium text-white"
      >
        {saved ? "Saved" : "Save settings"}
      </button>
      <p className="text-xs text-ink-muted">
        Prototype note: /admin has no auth. In production this would sit behind
        center staff SSO.
      </p>
    </div>
  );
}
