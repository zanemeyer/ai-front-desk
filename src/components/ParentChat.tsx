"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AskResult, ChatTurn, HandbookEntry } from "@/lib/types";
import {
  AlertIcon,
  ArrowRight,
  CheckIcon,
  ChevronDown,
  MailIcon,
  SendIcon,
  ShieldIcon,
  ThumbDown,
  ThumbUp,
} from "./icons";

type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; result: AskResult; question: string };

const SUGGESTIONS: { q: string; tag: string }[] = [
  { q: "Are you open on Veterans Day?", tag: "Hours" },
  { q: "What's the tuition?", tag: "Tuition" },
  { q: "My child has a fever, can they come in?", tag: "Health" },
  { q: "I forgot to pack lunch. Can you provide lunch today and what is it?", tag: "Meals" },
  { q: "How can I schedule a tour?", tag: "Tours" },
  { q: "Do you offer a sibling discount?", tag: "Billing" },
];

export default function ParentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [centerName, setCenterName] = useState("Sunny Hollow");
  const [director, setDirector] = useState<AskResult["director"] | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: { centerName?: string; director?: AskResult["director"] }) => {
        if (cancelled) return;
        if (s.centerName) setCenterName(s.centerName);
        if (s.director) setDirector(s.director);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  /** Last few turns, sent so follow-ups like "what about toddlers?" resolve. */
  function historyForServer(): ChatTurn[] {
    const turns: ChatTurn[] = [];
    for (const m of messages) {
      if (m.role === "user") turns.push({ role: "parent", text: m.text });
      else turns.push({ role: "frontdesk", text: m.result.answer });
    }
    return turns.slice(-4);
  }

  /** `display` lets a tapped chip show as "Toddlers" while the server gets the full question. */
  async function send(question: string, display?: string) {
    const q = question.trim();
    if (!q || loading) return;
    setInput("");
    const history = historyForServer();
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", text: display ?? q }]);
    setLoading(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setMessages((m) => [
        ...m,
        { id: `a-${Date.now()}`, role: "assistant", result: data as AskResult, question: q },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          question: q,
          result: {
            outcome: "gap",
            answer: err instanceof Error ? err.message : "Something went wrong. Please try again.",
            citedEntries: [],
            questionId: "",
          },
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function feedback(questionId: string, value: "up" | "down") {
    if (!questionId) return;
    await fetch("/api/questions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: questionId, feedback: value, ...(value === "down" ? { resolved: false } : {}) }),
    });
  }

  const suggestionList = (compact: boolean) => (
    <div className="flex flex-col gap-1.5">
      {SUGGESTIONS.map((s) => (
        <button
          key={s.q}
          type="button"
          onClick={() => send(s.q)}
          disabled={loading}
          className={`group flex items-center gap-3 rounded-2xl border border-line bg-card text-left text-ink transition hover:border-leaf hover:bg-leaf-soft/40 disabled:opacity-60 ${
            compact ? "px-3 py-2.5 text-sm" : "px-3.5 py-3 text-[14px]"
          }`}
        >
          <span className="pill pill-neutral shrink-0 group-hover:bg-leaf-soft group-hover:text-leaf-deep">{s.tag}</span>
          <span className="min-w-0 flex-1 leading-snug">{s.q}</span>
          <ArrowRight size={14} className="shrink-0 text-ink-faint group-hover:text-leaf" />
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex h-dvh flex-col">
      {/* Top bar */}
      <header className="z-10 border-b border-line bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 lg:px-8">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-leaf font-display text-sm font-semibold text-white">
            SH
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[17px] font-semibold leading-tight text-ink">
              {centerName} <span className="hidden text-ink-muted sm:inline">· Front Desk</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-ink-muted">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-leaf" />
              <span className="truncate">Answers from our family handbook, with sources</span>
            </div>
          </div>
          <Link href="/admin" className="btn btn-secondary btn-sm text-xs" title="Operator control center">
            Staff <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 lg:grid lg:grid-cols-[320px_1fr] lg:gap-8 lg:px-8 lg:py-8">
        {/* Side panel (desktop only) */}
        <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto lg:flex">
          <section className="card p-5">
            <h2 className="font-display text-xl font-semibold leading-tight">How can we help today?</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
              Ask anything you&apos;d normally call the office about. Every answer links to the handbook entry it
              came from, so you can check it yourself.
            </p>
            <ul className="mt-4 space-y-2.5 text-[13px] text-ink">
              <li className="flex gap-2.5">
                <CheckIcon size={15} className="mt-0.5 shrink-0 text-leaf" />
                Specific to {centerName}, never generic advice.
              </li>
              <li className="flex gap-2.5">
                <ShieldIcon size={15} className="mt-0.5 shrink-0 text-leaf" />
                Sensitive topics go straight to a person, and we&apos;ll tell you who.
              </li>
              <li className="flex gap-2.5">
                <AlertIcon size={15} className="mt-0.5 shrink-0 text-leaf" />
                If it&apos;s not in the handbook, we say so instead of guessing.
              </li>
            </ul>
          </section>
          <section>
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Parents often ask
            </div>
            {suggestionList(false)}
          </section>
          {director && (
            <section className="card p-4 text-[13px] text-ink-muted">
              <div className="font-semibold text-ink">Prefer a person?</div>
              <div className="mt-1">
                {director.name}, Director · <a href={`tel:${director.phone}`} className="text-leaf-deep hover:underline">{director.phone}</a>
              </div>
              <a href={`mailto:${director.email}`} className="text-leaf-deep hover:underline">
                {director.email}
              </a>
            </section>
          )}
        </aside>

        {/* Chat column */}
        <section className="flex min-h-0 flex-1 flex-col bg-card lg:overflow-hidden lg:rounded-[24px] lg:border lg:border-line lg:shadow-[var(--shadow-md)]">
          <main className="scrollbar-thin flex-1 overflow-y-auto px-4 py-4 lg:px-6 lg:py-6">
            <div className="mx-auto flex max-w-2xl flex-col gap-3">
              <FrontDeskRow>
                <Bubble>
                  Hi! I&apos;m the {centerName} front desk. Ask me about hours, tuition, illness, meals, tours, or
                  anything in our family handbook. I&apos;ll show you where each answer comes from.
                </Bubble>
              </FrontDeskRow>

              {messages.length === 0 && (
                <div className="animate-fade-up pl-9 lg:hidden">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                    Parents often ask
                  </div>
                  {suggestionList(true)}
                </div>
              )}

              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end animate-fade-up">
                    <div className="max-w-[82%] rounded-[20px] rounded-br-md bg-leaf px-4 py-2.5 text-[15px] leading-snug text-white shadow-[var(--shadow-sm)]">
                      {m.text}
                    </div>
                  </div>
                ) : (
                  <FrontDeskRow key={m.id}>
                    <AssistantBubble
                      result={m.result}
                      question={m.question}
                      isLatest={i === messages.length - 1}
                      onFeedback={feedback}
                      onPick={(opt) => send(`${m.question} — ${opt}`, opt)}
                    />
                  </FrontDeskRow>
                )
              )}

              {loading && (
                <FrontDeskRow>
                  <Bubble>
                    <span className="flex items-center gap-2 text-ink-muted">
                      <span className="typing">
                        <span />
                        <span />
                        <span />
                      </span>
                      Checking the handbook
                    </span>
                  </Bubble>
                </FrontDeskRow>
              )}
              <div ref={bottomRef} className="h-1" />
            </div>
          </main>

          {/* Composer */}
          <footer className="border-t border-line bg-card px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:px-6 lg:pb-5 lg:pt-4">
            <form
              className="mx-auto flex max-w-2xl items-center gap-2 rounded-full border border-line-strong bg-card py-1 pl-4 pr-1 transition focus-within:border-leaf focus-within:shadow-[0_0_0_3px_rgba(45,122,88,0.15)]"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={messages.length ? "Ask a follow-up…" : "Ask a question…"}
                autoComplete="off"
                enterKeyHint="send"
                className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-ink-faint"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-leaf text-white transition hover:bg-leaf-deep disabled:opacity-35"
              >
                <SendIcon size={16} strokeWidth={2.5} />
              </button>
            </form>
            <div className="mx-auto mt-2 max-w-2xl px-2 text-[11px] text-ink-faint lg:hidden">
              Sensitive questions go straight to a person.
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FrontDeskRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-end gap-2 animate-fade-up">
      <div className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-[10px] font-bold text-leaf-deep">
        SH
      </div>
      <div className="min-w-0 max-w-[88%] flex-1 lg:max-w-[80%]">{children}</div>
    </div>
  );
}

function Bubble({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`inline-block max-w-full rounded-[20px] rounded-bl-md border border-line bg-bg-soft/50 px-4 py-2.5 text-[15px] leading-snug text-ink ${className}`}
    >
      {children}
    </div>
  );
}

function SourceChip({ entry, question }: { entry: HandbookEntry; question: string }) {
  const [open, setOpen] = useState(false);
  const [flagged, setFlagged] = useState(false);

  async function flagOutdated() {
    setFlagged(true);
    await fetch("/api/flag-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: entry.id, question }),
    });
  }

  const [ageDays] = useState(() => Math.floor((Date.now() - new Date(entry.updatedAt).getTime()) / 86_400_000));

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink">{entry.title}</span>
          <span className="block text-[11px] text-ink-muted">
            {entry.category} · updated {ageDays === 0 ? "today" : `${ageDays}d ago`}
          </span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-ink-faint transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-line bg-bg-soft/40 px-3 py-2.5">
          <p className="text-[13px] leading-relaxed text-ink">{entry.content}</p>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-muted">
            <span>By {entry.updatedBy}</span>
            <button
              type="button"
              disabled={flagged}
              onClick={flagOutdated}
              className={`btn btn-sm ${flagged ? "btn-ghost" : "btn-secondary"} !text-[11px]`}
            >
              {flagged ? (
                <>
                  <CheckIcon size={12} /> Flagged for the office
                </>
              ) : (
                "This looks outdated"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AssistantBubble({
  result,
  question,
  isLatest,
  onFeedback,
  onPick,
}: {
  result: AskResult;
  question: string;
  isLatest: boolean;
  onFeedback: (id: string, v: "up" | "down") => void;
  onPick: (option: string) => void;
}) {
  const [sent, setSent] = useState<"up" | "down" | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const meta = {
    answered: { label: "From the handbook", pill: "pill-leaf", icon: <CheckIcon size={11} /> },
    clarify: { label: "Quick question", pill: "pill-neutral", icon: null },
    gap: { label: "Not in the handbook yet", pill: "pill-sun", icon: <AlertIcon size={11} /> },
    escalation: {
      label: result.staffNotified ? "Staff notified" : "Connecting you with staff",
      pill: "pill-rose",
      icon: <ShieldIcon size={11} />,
    },
  }[result.outcome];

  const frame =
    result.outcome === "escalation"
      ? "border-rose/30 bg-rose-soft/40"
      : result.outcome === "gap"
        ? "border-sun/40 bg-sun-soft/40"
        : "border-line bg-bg-soft/50";

  return (
    <div className={`rounded-[20px] rounded-bl-md border px-4 py-3 ${frame}`}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className={`pill ${meta.pill}`}>
          {meta.icon}
          {meta.label}
        </span>
        {result.outcome === "answered" && result.confidence && (
          <span className="flex items-center gap-1 text-[11px] text-ink-muted">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                result.confidence === "high" ? "bg-leaf" : result.confidence === "medium" ? "bg-sun" : "bg-rose"
              }`}
            />
            {result.confidence} confidence
          </span>
        )}
      </div>

      <p className="text-[15px] leading-snug text-ink">{result.answer}</p>

      {result.outcome === "clarify" && result.clarificationOptions && (
        <div className="mt-3 flex flex-wrap gap-2">
          {result.clarificationOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              disabled={!isLatest || picked !== null}
              onClick={() => {
                setPicked(opt);
                onPick(opt);
              }}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${
                picked === opt
                  ? "border-leaf bg-leaf text-white"
                  : "border-leaf/40 bg-card text-leaf-deep hover:border-leaf hover:bg-leaf-soft/60 disabled:opacity-50"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {result.caveats && result.caveats.length > 0 && (
        <div className="mt-3 flex gap-2 rounded-xl border border-sun/50 bg-sun-soft/60 px-3 py-2 text-[13px] leading-snug text-ink">
          <AlertIcon size={14} className="mt-0.5 shrink-0 text-sun" />
          <div>
            {result.caveats.map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
        </div>
      )}

      {result.citedEntries.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            Source{result.citedEntries.length > 1 ? "s" : ""}
          </div>
          {result.citedEntries.map((e) => (
            <SourceChip key={e.id} entry={e} question={question} />
          ))}
        </div>
      )}

      {(result.outcome === "answered" || (result.director && result.outcome !== "clarify")) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {result.outcome === "answered" && result.questionId && (
            <>
              <button
                type="button"
                onClick={() => {
                  onFeedback(result.questionId, "up");
                  setSent("up");
                }}
                aria-pressed={sent === "up"}
                className={`btn btn-sm ${sent === "up" ? "btn-primary" : "btn-secondary"} !text-xs`}
              >
                <ThumbUp size={13} /> Helpful
              </button>
              <button
                type="button"
                onClick={() => {
                  onFeedback(result.questionId, "down");
                  setSent("down");
                }}
                aria-pressed={sent === "down"}
                className={`btn btn-sm !text-xs ${sent === "down" ? "!bg-rose !border-rose text-white" : "btn-secondary"}`}
              >
                <ThumbDown size={13} /> Not quite
              </button>
            </>
          )}
          {result.director && (
            <a
              href={`mailto:${result.director.email}?subject=Front%20Desk%20follow-up&body=${encodeURIComponent(`Hi ${result.director.name.split(" ")[0]},\n\nI asked the Front Desk: "${question}"\n\n`)}`}
              className="btn btn-sm btn-ghost ml-auto !text-xs"
            >
              <MailIcon size={13} /> Message {result.director.name.split(" ")[0]}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
