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
import {
  AlertIcon,
  ArrowLeft,
  BellIcon,
  BookIcon,
  CheckIcon,
  ChevronDown,
  ClockIcon,
  CloseIcon,
  InboxIcon,
  PlusIcon,
  SettingsIcon,
  SparkIcon,
} from "./icons";

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

const TAB_META: Record<Tab, { title: string; blurb: string }> = {
  inbox: {
    title: "Needs attention",
    blurb: "Grouped by what parents are really asking. Answer once and every open question in the group is resolved.",
  },
  handbook: {
    title: "Handbook",
    blurb: "The source of truth. Published entries are the only thing the Front Desk is allowed to say.",
  },
  alerts: {
    title: "Staff alerts",
    blurb: "Every escalation pings staff automatically and tells the parent so. They never have to repeat themselves.",
  },
  settings: {
    title: "Settings",
    blurb: "Center details and the situations that should always reach a person.",
  },
};

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
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-ink-muted">
        <span className="typing">
          <span />
          <span />
          <span />
        </span>
        Loading control center
      </div>
    );
  }

  const nav: { id: Tab; label: string; icon: React.ReactNode; count?: number; urgent?: boolean }[] = [
    { id: "inbox", label: "Needs attention", icon: <InboxIcon size={18} />, count: clusters.length },
    { id: "handbook", label: "Handbook", icon: <BookIcon size={18} />, count: entries.length },
    { id: "alerts", label: "Staff alerts", icon: <BellIcon size={18} />, count: unacked || undefined, urgent: true },
    { id: "settings", label: "Settings", icon: <SettingsIcon size={18} /> },
  ];

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* Sidebar (desktop) */}
      <aside className="hidden border-r border-line bg-card/70 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="flex items-center gap-3 px-5 pb-4 pt-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-leaf font-display text-sm font-semibold text-white">
            SH
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-[15px] font-semibold leading-tight">{settings.centerName}</div>
            <div className="text-xs text-ink-muted">Control center</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          {nav.map((n) => (
            <NavButton key={n.id} active={tab === n.id} onClick={() => setTab(n.id)} {...n} />
          ))}
        </nav>
        <div className="mt-auto space-y-3 px-5 pb-6 text-xs text-ink-muted">
          {storeKind && (
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${storeKind === "memory" ? "bg-sun" : "bg-leaf"}`} />
              {storeKind === "memory" ? "In-memory demo store" : `Persistent · ${storeKind}`}
            </div>
          )}
          <Link href="/" className="btn btn-secondary btn-sm w-full">
            <ArrowLeft size={14} /> Parent view
          </Link>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-dvh flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 border-b border-line bg-card/90 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-leaf font-display text-xs font-semibold text-white">
              SH
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-[15px] font-semibold leading-tight">{settings.centerName}</div>
              <div className="text-[11px] text-ink-muted">Control center</div>
            </div>
            <Link href="/" className="btn btn-ghost btn-sm">
              <ArrowLeft size={14} /> Parent
            </Link>
          </div>
          <nav className="scrollbar-thin flex gap-1 overflow-x-auto px-3 pb-2">
            {nav.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setTab(n.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  tab === n.id ? "bg-leaf text-white" : "bg-bg-soft text-ink-muted"
                }`}
              >
                {n.label}
                {n.count ? (
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${
                      tab === n.id ? "bg-white/20" : n.urgent ? "bg-rose text-white" : "bg-card"
                    }`}
                  >
                    {n.count}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mb-6">
            <h1 className="font-display text-2xl font-semibold tracking-tight lg:text-3xl">{TAB_META[tab].title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">{TAB_META[tab].blurb}</p>
          </div>

          {tab === "inbox" && (
            <>
              <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
                <Stat label="Questions · 7d" value={String(stats.questionsThisWeek)} />
                <Stat label="Auto-answered" value={`${stats.autoAnsweredPct}%`} />
                <Stat
                  label="Hours saved · 7d"
                  value={`${stats.hoursSavedThisWeek}h`}
                  hint={`${stats.minutesPerQuestion} min per answered question`}
                  tone="leaf"
                  wide
                />
                <Stat label="Escalated" value={String(stats.escalated)} tone={stats.escalated ? "rose" : undefined} />
                <Stat label="Open gaps" value={String(stats.openGaps)} tone={stats.openGaps ? "sun" : undefined} />
              </section>

              {stats.topTopics.length > 0 && (
                <div className="mb-6 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Top topics</span>
                  {stats.topTopics.map((t) => (
                    <span key={t.topic} className="pill pill-neutral !normal-case !tracking-normal">
                      {t.topic} <span className="text-ink-faint">{t.count}</span>
                    </span>
                  ))}
                </div>
              )}

              <Inbox
                clusters={clusters}
                entries={entries}
                onResolved={refresh}
                onEditEntry={(id) => {
                  setEditEntryId(id);
                  setTab("handbook");
                }}
              />
            </>
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
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NavButton({
  active,
  onClick,
  label,
  icon,
  count,
  urgent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  count?: number;
  urgent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
        active ? "bg-leaf text-white shadow-[var(--shadow-sm)]" : "text-ink-muted hover:bg-bg-soft hover:text-ink"
      }`}
    >
      <span className={active ? "text-white" : "text-ink-faint"}>{icon}</span>
      <span className="flex-1">{label}</span>
      {count ? (
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            active ? "bg-white/20 text-white" : urgent ? "bg-rose text-white" : "bg-bg-soft text-ink-muted"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
  wide,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "leaf" | "sun" | "rose";
  wide?: boolean;
}) {
  const ring =
    tone === "leaf"
      ? "border-leaf/30 bg-leaf-soft/60"
      : tone === "sun"
        ? "border-sun/40 bg-sun-soft/60"
        : tone === "rose"
          ? "border-rose/30 bg-rose-soft/50"
          : "border-line bg-card";
  return (
    <div className={`rounded-2xl border px-4 py-3.5 shadow-[var(--shadow-sm)] ${ring} ${wide ? "col-span-2 md:col-span-1" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="mt-1 font-display text-[28px] font-semibold leading-none tracking-tight text-ink">{value}</div>
      {hint && <div className="mt-1.5 text-[11px] text-ink-muted">{hint}</div>}
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

const OUTCOME_PILL: Record<string, string> = {
  gap: "pill-sun",
  escalation: "pill-rose",
  stale_flag: "pill-sun",
  answered: "pill-neutral",
  clarify: "pill-neutral",
};

function StruggleDetail({ q }: { q: QuestionLog }) {
  return (
    <div className="rounded-xl border border-line bg-bg-soft/40 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-muted">
      <div className="font-medium text-ink">“{q.question}”</div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        <span className="inline-flex items-center gap-1">
          <ClockIcon size={12} /> {fmtWhen(q.askedAt)}
        </span>
        {q.channel && <span>via {q.channel}</span>}
        {q.confidence && <span>confidence: {q.confidence}</span>}
        {q.promptVersion && <span className="font-mono text-[11px]">{q.promptVersion}</span>}
      </div>
      {q.reason && (
        <div className="mt-1.5">
          <span className="font-semibold text-ink">Why it struggled:</span> {q.reason}
        </div>
      )}
      {q.rejectedCitationIds && q.rejectedCitationIds.length > 0 && (
        <div className="mt-1 text-rose">
          Model cited entries that don’t exist: {q.rejectedCitationIds.join(", ")} (rejected by the server)
        </div>
      )}
      {q.feedback === "down" && q.answerPreview && (
        <div className="mt-1">
          <span className="font-semibold text-ink">Parent said “not quite” to:</span> “{q.answerPreview}”
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
      <div className="card flex flex-col items-center px-6 py-14 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-leaf-soft text-leaf-deep">
          <CheckIcon size={22} />
        </div>
        <div className="font-semibold">Inbox clear</div>
        <div className="mt-1 text-sm text-ink-muted">No open gaps, escalations, or flags.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {clusters.map((c) => {
        const first = c.items[0];
        const flagged = first.flaggedEntryId ? entries.find((e) => e.id === first.flaggedEntryId) : null;
        const isOpen = expanded === c.intent;
        const edge =
          c.outcome === "escalation" ? "border-l-rose" : c.outcome === "stale_flag" ? "border-l-sun" : "border-l-leaf";
        return (
          <div key={c.intent} className={`card overflow-hidden border-l-4 ${edge}`}>
            <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-3">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setExpanded(isOpen ? null : c.intent)}
                aria-expanded={isOpen}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-ink">
                    {c.outcome === "stale_flag" && flagged ? `Outdated? “${flagged.title}”` : c.label}
                  </span>
                  {c.count > 1 && (
                    <span className="rounded-full bg-leaf px-2 py-0.5 text-[11px] font-bold text-white">×{c.count}</span>
                  )}
                  <span className={`pill ${OUTCOME_PILL[c.outcome] ?? "pill-neutral"}`}>
                    {OUTCOME_LABEL[c.outcome] ?? c.outcome}
                  </span>
                </div>
                <div className="mt-1 truncate text-[13px] text-ink-muted">
                  “{first.question}” · {c.topic} · {fmtWhen(c.lastAskedAt)}
                </div>
                {!isOpen && first.reason && (
                  <div className="mt-1 line-clamp-1 text-[13px] text-ink-muted">
                    <span className="font-semibold text-ink">Why:</span> {first.reason}
                  </div>
                )}
              </button>
              <div className="flex items-center gap-1.5 sm:shrink-0">
                {c.outcome === "stale_flag" && flagged ? (
                  <button type="button" onClick={() => onEditEntry(flagged.id)} className="btn btn-primary btn-sm">
                    Review entry
                  </button>
                ) : (
                  <button type="button" onClick={() => setActive(c)} className="btn btn-primary btn-sm">
                    {c.outcome === "escalation" ? "Handle" : "Answer & add"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : c.intent)}
                  className="btn btn-ghost btn-sm !px-2"
                  aria-label={isOpen ? "Hide details" : "Show details"}
                >
                  <ChevronDown size={16} className={`transition ${isOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>
            {isOpen && (
              <div className="space-y-2 border-t border-line bg-bg-soft/20 px-4 py-3">
                {c.items.map((q) => (
                  <StruggleDetail key={q.id} q={q} />
                ))}
                {c.outcome === "stale_flag" && (
                  <ResolveOnly intent={c.intent} onDone={onResolved} label="Entry is still correct — dismiss" />
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
      className="btn btn-secondary btn-sm"
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */

function Modal({
  title,
  eyebrow,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[24px] border border-line bg-card p-5 shadow-[var(--shadow-lg)] sm:rounded-[24px] sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && (
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{eyebrow}</div>
            )}
            <h3 className="font-display text-xl font-semibold leading-tight">{title}</h3>
            {subtitle && <p className="mt-1 text-[13px] text-ink-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm -mr-2 !px-2" aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Steps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Answer", "Edit entry", "Test"];
  return (
    <ol className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
      {steps.map((s, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const done = n < current;
        const here = n === current;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                done ? "bg-leaf text-white" : here ? "bg-ink text-white" : "bg-bg-soft text-ink-faint"
              }`}
            >
              {done ? <CheckIcon size={11} /> : n}
            </span>
            <span className={here ? "text-ink" : "text-ink-faint"}>{s}</span>
            {i < steps.length - 1 && <span className="h-px w-5 bg-line" />}
          </li>
        );
      })}
    </ol>
  );
}

function TestResultCard({ r }: { r: AskResult }) {
  return (
    <div className="rounded-2xl border border-line bg-bg-soft/40 px-4 py-3 text-sm">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className={`pill ${OUTCOME_PILL[r.outcome] ?? "pill-neutral"} ${r.outcome === "answered" ? "!bg-leaf-soft !text-leaf-deep" : ""}`}>
          {r.outcome}
        </span>
        {r.confidence && <span className="text-xs text-ink-muted">{r.confidence} confidence</span>}
        {r.promptVersion && <span className="font-mono text-[11px] text-ink-faint">{r.promptVersion}</span>}
      </div>
      <p className="leading-snug">{r.answer}</p>
      {r.caveats?.map((c) => (
        <div key={c} className="mt-1.5 flex gap-1.5 text-xs text-ink">
          <AlertIcon size={13} className="mt-0.5 shrink-0 text-sun" /> {c}
        </div>
      ))}
      {r.citedEntries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.citedEntries.map((e) => (
            <span key={e.id} className="rounded-md bg-card px-2 py-0.5 text-xs text-ink-muted ring-1 ring-line">
              {e.title}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

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
    <Modal
      title={cluster.label}
      subtitle={
        cluster.count === 1 ? `“${primary.question}”` : `${cluster.count} parents asked this, e.g. “${primary.question}”`
      }
      onClose={onClose}
    >
      <Steps current={step === "answer" ? 1 : step === "edit" ? 2 : 3} />

      {step === "answer" && (
        <div className="mb-4 space-y-1.5">
          {cluster.items.slice(0, 3).map((q) => (
            <StruggleDetail key={q.id} q={q} />
          ))}
        </div>
      )}

      {cluster.outcome === "escalation" && step === "answer" && (
        <div className="mb-4 flex gap-2 rounded-xl border border-rose/30 bg-rose-soft/40 px-3.5 py-2.5 text-[13px] leading-snug text-ink">
          <AlertIcon size={15} className="mt-0.5 shrink-0 text-rose" />
          This was escalated and staff were alerted. Resolve after handling it directly, or add a handbook note if a
          general policy would help future parents.
        </div>
      )}

      {error && <div className="mb-3 rounded-xl bg-rose-soft/60 px-3.5 py-2 text-sm text-rose">{error}</div>}

      {step === "answer" && (
        <>
          <label className="label">Your answer to the parent</label>
          <textarea
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            rows={4}
            placeholder="Type the answer you'd give if they called the office…"
            className="field resize-none"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={!quick.trim() || busy} onClick={draftEntry} className="btn btn-primary">
              <SparkIcon size={15} />
              {busy ? "Drafting…" : "Draft handbook entry"}
            </button>
            <button type="button" onClick={markResolvedOnly} className="btn btn-ghost">
              Resolve{cluster.count > 1 ? ` all ${cluster.count}` : ""} without adding
            </button>
          </div>
        </>
      )}

      {step === "edit" && (
        <>
          <label className="label">Title</label>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="field mb-3" />
          <label className="label">Category</label>
          <select
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            className="field mb-3"
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className="label">Content</label>
          <textarea
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            rows={6}
            className="field resize-y"
          />
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={busy} onClick={publish} className="btn btn-primary">
              {busy ? "Publishing…" : `Publish & resolve${cluster.count > 1 ? ` ${cluster.count} questions` : ""}`}
            </button>
            <button type="button" onClick={() => setStep("answer")} className="btn btn-ghost">
              Back
            </button>
          </div>
        </>
      )}

      {step === "test" && (
        <>
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-leaf-soft/70 px-3.5 py-2.5 text-[13px] text-leaf-deep">
            <CheckIcon size={15} />
            Published. {cluster.count} question{cluster.count > 1 ? "s" : ""} resolved. Re-ask to confirm it works.
          </div>
          <div className="flex gap-2">
            <input value={testQ} onChange={(e) => setTestQ(e.target.value)} className="field" />
            <button type="button" disabled={busy} onClick={runTest} className="btn btn-primary shrink-0">
              {busy ? "Asking…" : "Test it"}
            </button>
          </div>
          {testResult && (
            <div className="mt-3">
              <TestResultCard r={testResult} />
            </div>
          )}
          <button type="button" onClick={onDone} className="btn btn-secondary mt-4">
            Done
          </button>
        </>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function freshness(e: HandbookEntry): { label: string; stale: boolean } | null {
  if (!e.reviewEveryDays) return null;
  const age = Math.floor((Date.now() - new Date(e.updatedAt).getTime()) / 86_400_000);
  return age > e.reviewEveryDays
    ? { label: `Stale · ${age}d old, reviews every ${e.reviewEveryDays}d`, stale: true }
    : { label: `Fresh · ${age}d / ${e.reviewEveryDays}d`, stale: false };
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
  const published = entries.filter((e) => e.status === "published").length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-ink-muted">
            {published} published · {entries.length - published} draft
          </div>
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
            className="btn btn-primary btn-sm"
          >
            <PlusIcon size={14} /> New entry
          </button>
        </div>
        {byCategory.map(([cat, list]) => (
          <section key={cat}>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{cat}</h2>
            <div className="space-y-2">
              {list.map((e) => {
                const f = freshness(e);
                const expired = e.effectiveUntil && e.effectiveUntil < today;
                const notYet = e.effectiveFrom && e.effectiveFrom > today;
                return (
                  <article key={e.id} className={`card px-4 py-3.5 ${e.status === "draft" ? "opacity-70" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[15px] font-semibold text-ink">{e.title}</span>
                          <span className={`pill ${e.status === "published" ? "pill-leaf" : "pill-neutral"}`}>
                            {e.status}
                          </span>
                          {f && <span className={`pill ${f.stale ? "pill-sun" : "pill-neutral"}`}>{f.label}</span>}
                          {(expired || notYet) && (
                            <span className="pill pill-rose">{expired ? "expired · not used" : "not yet in effect"}</span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-ink-muted">
                          Updated {new Date(e.updatedAt).toLocaleDateString()} by {e.updatedBy}
                          {(e.effectiveFrom || e.effectiveUntil) && (
                            <>
                              {" "}
                              · in effect {e.effectiveFrom ?? "…"} → {e.effectiveUntil ?? "…"}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => setEditing(e)} className="btn btn-secondary btn-sm">
                          Edit
                        </button>
                        <button type="button" onClick={() => toggleStatus(e)} className="btn btn-ghost btn-sm">
                          {e.status === "published" ? "Unpublish" : "Publish"}
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">{e.content}</p>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <aside className="card h-fit p-4 lg:sticky lg:top-6">
        <div className="flex items-center gap-2">
          <SparkIcon size={16} className="text-leaf" />
          <h3 className="text-sm font-semibold">Test a question</h3>
        </div>
        <p className="mt-1 text-xs text-ink-muted">Runs against the live published handbook. Not counted in stats.</p>
        <textarea
          value={testQ}
          onChange={(e) => setTestQ(e.target.value)}
          rows={3}
          className="field mt-3 resize-none"
          placeholder="e.g. Are you open on Veterans Day?"
        />
        <button type="button" disabled={busy || !testQ.trim()} onClick={runTest} className="btn btn-primary mt-2 w-full">
          {busy ? "Asking…" : "Ask"}
        </button>
        {testResult && (
          <div className="mt-3">
            <TestResultCard r={testResult} />
          </div>
        )}
      </aside>

      {editing && (
        <Modal title={editing.id ? "Edit entry" : "New entry"} onClose={() => setEditing(null)}>
          <label className="label">Title</label>
          <input
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            placeholder="e.g. 2026–2027 holiday closures"
            className="field mb-3"
          />
          <label className="label">Category</label>
          <select
            value={editing.category}
            onChange={(e) => setEditing({ ...editing, category: e.target.value })}
            className="field mb-3"
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className="label">Content</label>
          <textarea
            value={editing.content}
            onChange={(e) => setEditing({ ...editing, content: e.target.value })}
            rows={6}
            className="field mb-3 resize-y"
          />
          <div className="mb-2 grid grid-cols-3 gap-2">
            <div>
              <label className="label">In effect from</label>
              <input
                type="date"
                value={editing.effectiveFrom ?? ""}
                onChange={(e) => setEditing({ ...editing, effectiveFrom: e.target.value || undefined })}
                className="field !px-2"
              />
            </div>
            <div>
              <label className="label">Until</label>
              <input
                type="date"
                value={editing.effectiveUntil ?? ""}
                onChange={(e) => setEditing({ ...editing, effectiveUntil: e.target.value || undefined })}
                className="field !px-2"
              />
            </div>
            <div>
              <label className="label">Changes every</label>
              <input
                type="number"
                min={1}
                placeholder="days"
                value={editing.reviewEveryDays ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, reviewEveryDays: e.target.value ? Number(e.target.value) : undefined })
                }
                className="field"
              />
            </div>
          </div>
          <p className="mb-4 text-[11px] leading-snug text-ink-muted">
            Expired entries are excluded from answers. “Changes every” adds a confirm-with-office caveat once the entry
            is older than that.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !editing.title || !editing.content}
              onClick={() => save({ ...editing, updatedBy: "Staff" })}
              className="btn btn-primary"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="btn btn-ghost">
              Cancel
            </button>
          </div>
        </Modal>
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
      <div className="card flex flex-col items-center px-6 py-14 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-bg-soft text-ink-muted">
          <BellIcon size={22} />
        </div>
        <div className="font-semibold">No staff alerts yet</div>
        <div className="mt-1 max-w-sm text-sm text-ink-muted">
          Escalated parent messages show up here, and are emailed when RESEND_API_KEY is set.
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {items.map((n) => {
        const q = questions.find((x) => x.id === n.questionId);
        return (
          <div
            key={n.id}
            className={`card border-l-4 px-4 py-3.5 ${n.acknowledged ? "border-l-line opacity-70" : "border-l-rose"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-ink">“{n.question}”</div>
                <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-ink-muted">
                  <span className="pill pill-rose">{n.topic}</span>
                  <span>via {n.channel}</span>
                  <span>· {fmtWhen(n.createdAt)}</span>
                  <span>· {n.via === "email" ? "emailed" : "control center"}</span>
                </div>
                {q?.reason && <div className="mt-1.5 text-[13px] text-ink-muted">{q.reason}</div>}
              </div>
              {n.acknowledged ? (
                <span className="pill pill-neutral shrink-0">
                  <CheckIcon size={11} /> Handled
                </span>
              ) : (
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
                  className="btn btn-primary btn-sm shrink-0"
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
    <div className="max-w-2xl space-y-5">
      <section className="card p-5">
        <h2 className="mb-4 font-semibold">Center</h2>
        <label className="label">Center name</label>
        <input value={form.centerName} onChange={(e) => setForm({ ...form, centerName: e.target.value })} className="field mb-4" />
        <div className="grid gap-3 sm:grid-cols-3">
          {(["name", "phone", "email"] as const).map((k) => (
            <div key={k}>
              <label className="label">{k === "name" ? "Director" : k}</label>
              <input
                value={form.director[k]}
                onChange={(e) => setForm({ ...form, director: { ...form.director, [k]: e.target.value } })}
                className="field"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Situations that need a human</h2>
        <p className="mb-3 mt-1 text-[13px] text-ink-muted">
          One per line. Describe the situation, not a keyword. The classifier uses these as guidance, and the parent
          is told that staff have been pinged.
        </p>
        <textarea value={topicsText} onChange={(e) => setTopicsText(e.target.value)} rows={9} className="field resize-y" />
      </section>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} className="btn btn-primary">
          {saved ? (
            <>
              <CheckIcon size={15} /> Saved
            </>
          ) : (
            "Save settings"
          )}
        </button>
        <p className="text-xs text-ink-muted">Prototype note: /admin has no auth. In production this sits behind staff SSO.</p>
      </div>
    </div>
  );
}
