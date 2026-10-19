import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { addQuestion, getEntries } from "@/lib/store";
import type { QuestionLog } from "@/lib/types";

/**
 * Parent-side trust lever: "this looks outdated" on a specific source chip.
 * Files a targeted stale_flag against that entry so it lands in the operator
 * inbox with a direct link to edit the entry.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const entryId = String(body.entryId ?? "");
    const question = String(body.question ?? "");
    const note = String(body.note ?? "").slice(0, 300);
    if (!entryId) return NextResponse.json({ error: "entryId required" }, { status: 400 });

    const entry = (await getEntries()).find((e) => e.id === entryId);
    if (!entry) return NextResponse.json({ error: "Unknown entry" }, { status: 404 });

    const log: QuestionLog = {
      id: randomUUID(),
      question: question || `Parent flagged "${entry.title}" as outdated`,
      askedAt: new Date().toISOString(),
      outcome: "stale_flag",
      channel: "web",
      topic: entry.category,
      intent: `stale_${entry.id}`,
      flaggedEntryId: entry.id,
      reason: note
        ? `Parent note: ${note}`
        : `A parent reported "${entry.title}" as outdated after seeing it cited.`,
      resolved: false,
    };
    await addQuestion(log);
    return NextResponse.json({ ok: true, id: log.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Flag failed" },
      { status: 500 }
    );
  }
}
