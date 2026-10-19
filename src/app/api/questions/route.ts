import { NextResponse } from "next/server";
import { getQuestions, updateQuestion } from "@/lib/store";
import { computeStats } from "@/lib/stats";


export async function GET() {
  const [questions, stats] = await Promise.all([
    getQuestions(),
    computeStats(),
  ]);
  return NextResponse.json({ questions, stats });
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const { id: _id, ...patch } = body;
    const updated = await updateQuestion(id, patch);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 }
    );
  }
}
