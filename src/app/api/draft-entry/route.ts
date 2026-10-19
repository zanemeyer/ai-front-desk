import { NextResponse } from "next/server";
import { draftHandbookEntry } from "@/lib/gemini";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = String(body.question ?? "");
    const operatorAnswer = String(body.operatorAnswer ?? "");
    const related: string[] = Array.isArray(body.relatedQuestions)
      ? body.relatedQuestions.map(String).slice(0, 8)
      : [];
    if (!question || !operatorAnswer) {
      return NextResponse.json(
        { error: "question and operatorAnswer required" },
        { status: 400 }
      );
    }
    const draft = await draftHandbookEntry(question, operatorAnswer, related);
    return NextResponse.json(draft);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Draft failed" },
      { status: 500 }
    );
  }
}
