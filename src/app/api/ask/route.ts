import { NextResponse } from "next/server";
import { askQuestion } from "@/lib/ask";
import type { ChatTurn } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = String(body.question ?? "");
    if (!question.trim()) {
      return NextResponse.json({ error: "Question required" }, { status: 400 });
    }
    const history: ChatTurn[] = Array.isArray(body.history)
      ? body.history
          .filter(
            (t: unknown): t is ChatTurn =>
              !!t &&
              typeof t === "object" &&
              typeof (t as ChatTurn).text === "string" &&
              ((t as ChatTurn).role === "parent" || (t as ChatTurn).role === "frontdesk")
          )
          .slice(-6)
      : [];
    const channel = body.channel === "admin-test" ? "admin-test" : "web";
    const result = await askQuestion(question, { history, channel });
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ask failed" },
      { status: 500 }
    );
  }
}
