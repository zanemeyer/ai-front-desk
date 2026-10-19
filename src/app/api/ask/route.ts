import { NextResponse } from "next/server";
import { askQuestion } from "@/lib/ask";


export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = String(body.question ?? "");
    if (!question.trim()) {
      return NextResponse.json({ error: "Question required" }, { status: 400 });
    }
    const result = await askQuestion(question);
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ask failed" },
      { status: 500 }
    );
  }
}
