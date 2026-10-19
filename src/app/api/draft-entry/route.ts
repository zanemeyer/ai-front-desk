import { NextResponse } from "next/server";
import { draftHandbookEntry } from "@/lib/gemini";


export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = String(body.question ?? "");
    const operatorAnswer = String(body.operatorAnswer ?? "");
    if (!question || !operatorAnswer) {
      return NextResponse.json(
        { error: "question and operatorAnswer required" },
        { status: 400 }
      );
    }
    const draft = await draftHandbookEntry(question, operatorAnswer);
    return NextResponse.json(draft);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Draft failed" },
      { status: 500 }
    );
  }
}
