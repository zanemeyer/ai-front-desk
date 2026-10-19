"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AskResult, ChatTurn, HandbookEntry } from "@/lib/types";

type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; result: AskResult; question: string };

const SUGGESTIONS = [
  "Are you open on Veterans Day?",
  "What's the tuition?",
  "My child has a fever, can they come in?",
  "I forgot to pack lunch. Can you provide lunch today and what is it?",
  "How can I schedule a tour?",
  "Do you offer a sibling discount?",
];

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

export default function ParentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setInput("");
    const history = historyForServer();
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", text: q }]);
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

  function toggleVoice() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      alert("Voice input works in Chrome / Edge.");
      return;
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (event) => {
      setInput(event.results[0][0].transcript);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-6 pt-5">
      <header className="mb-4 animate-fade-up">
        <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-leaf">Sunny Hollow</div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Front Desk</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          Ask about hours, tuition, illness, meals, tours, and more. Answers come from our handbook — with
          sources you can check.
        </p>
        <Link href="/admin" className="mt-3 inline-block text-xs font-medium text-leaf underline-offset-2 hover:underline">
          Operator control center →
        </Link>
      </header>

      {messages.length === 0 && (
        <div className="mb-4 flex flex-wrap gap-2 animate-fade-up">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border border-line bg-card px-3 py-1.5 text-left text-xs text-ink shadow-sm transition hover:border-leaf hover:text-leaf-deep"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div
              key={m.id}
              className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-leaf px-4 py-2.5 text-sm text-white shadow-sm animate-fade-up"
            >
              {m.text}
            </div>
          ) : (
            <AssistantBubble
              key={m.id}
              result={m.result}
              question={m.question}
              isLatest={i === messages.length - 1}
              onFeedback={feedback}
              onPick={(opt) => send(`${m.question} — ${opt}`)}
            />
          )
        )}
        {loading && (
          <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-card px-4 py-3 text-sm text-ink-muted shadow-sm">
            <span className="typing-dot">Looking in the handbook…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="sticky bottom-0 mt-4 flex gap-2 rounded-2xl border border-line bg-card p-2 shadow-[var(--shadow)]"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <button
          type="button"
          onClick={toggleVoice}
          aria-label="Voice input"
          className={`rounded-xl px-3 text-sm ${listening ? "bg-rose text-white" : "bg-bg-soft text-ink-muted hover:text-ink"}`}
        >
          {listening ? "●" : "🎤"}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={messages.length ? "Ask a follow-up…" : "Ask a question…"}
          className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-ink-muted/70"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-xl bg-leaf px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */

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

  const updated = new Date(entry.updatedAt);
  const ageDays = Math.floor((Date.now() - updated.getTime()) / 86_400_000);

  return (
    <div className="rounded-xl border border-line bg-bg-soft/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
      >
        <span className="font-medium text-leaf-deep">{entry.title}</span>
        <span className="shrink-0 text-xs text-ink-muted">{entry.category}</span>
      </button>
      {open && (
        <div className="border-t border-line px-3 py-2">
          <p className="text-sm leading-relaxed text-ink-muted">{entry.content}</p>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-muted">
            <span>Updated {ageDays === 0 ? "today" : `${ageDays}d ago`} by {entry.updatedBy}</span>
            <button
              type="button"
              disabled={flagged}
              onClick={flagOutdated}
              className="rounded-md border border-line px-2 py-0.5 text-[11px] hover:border-rose hover:text-rose disabled:opacity-60"
            >
              {flagged ? "Thanks — flagged for the office" : "This looks outdated"}
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

  const tone =
    result.outcome === "answered"
      ? "border-line bg-card"
      : result.outcome === "escalation"
        ? "border-rose/30 bg-rose-soft/40"
        : result.outcome === "clarify"
          ? "border-leaf/30 bg-leaf/5"
          : "border-sun/40 bg-sun-soft/35";

  const label = {
    answered: "From the handbook",
    gap: "Not in the handbook yet",
    escalation: result.staffNotified ? "Staff have been notified" : "Connecting you with staff",
    clarify: "Quick question",
  }[result.outcome];

  return (
    <div className={`max-w-[92%] rounded-2xl rounded-bl-md border px-4 py-3 shadow-sm animate-fade-up ${tone}`}>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-ink-muted">{label}</div>
      <p className="text-sm leading-relaxed text-ink">{result.answer}</p>

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
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                picked === opt
                  ? "border-leaf bg-leaf text-white"
                  : "border-leaf/40 bg-card text-leaf-deep hover:border-leaf disabled:opacity-50"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {result.caveats && result.caveats.length > 0 && (
        <div className="mt-3 rounded-xl border border-sun/50 bg-sun-soft/50 px-3 py-2 text-xs leading-relaxed text-ink">
          {result.caveats.map((c) => (
            <div key={c}>⚠ {c}</div>
          ))}
        </div>
      )}

      {result.citedEntries.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-leaf">
            Sources{result.confidence ? ` · ${result.confidence} confidence` : ""}
          </div>
          {result.citedEntries.map((e) => (
            <SourceChip key={e.id} entry={e} question={question} />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {result.outcome === "answered" && result.questionId && (
          <>
            <button
              type="button"
              onClick={() => {
                onFeedback(result.questionId, "up");
                setSent("up");
              }}
              className={`rounded-lg border px-2 py-1 text-xs ${sent === "up" ? "border-leaf bg-leaf text-white" : "border-line text-ink-muted"}`}
            >
              Helpful
            </button>
            <button
              type="button"
              onClick={() => {
                onFeedback(result.questionId, "down");
                setSent("down");
              }}
              className={`rounded-lg border px-2 py-1 text-xs ${sent === "down" ? "border-rose bg-rose text-white" : "border-line text-ink-muted"}`}
            >
              Not quite
            </button>
          </>
        )}
        {result.director && result.outcome !== "clarify" && (
          <a
            href={`mailto:${result.director.email}?subject=Front%20Desk%20follow-up&body=${encodeURIComponent(`Hi ${result.director.name.split(" ")[0]},\n\nI asked the Front Desk: "${question}"\n\n`)}`}
            className="rounded-lg border border-leaf/30 bg-leaf/10 px-2 py-1 text-xs font-medium text-leaf-deep"
          >
            Message the director
          </a>
        )}
      </div>
    </div>
  );
}
