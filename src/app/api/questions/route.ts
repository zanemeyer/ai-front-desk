import { NextResponse } from "next/server";
import { getQuestions, resolveIntent, updateQuestion } from "@/lib/store";
import { clusterInbox, computeStats } from "@/lib/stats";

export async function GET() {
  const [questions, stats] = await Promise.all([getQuestions(), computeStats()]);
  return NextResponse.json({ questions, stats, clusters: clusterInbox(questions) });
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();

    // Bulk-resolve a whole intent cluster
    if (typeof body.resolveIntent === "string") {
      const n = await resolveIntent(body.resolveIntent, body.resolvedEntryId);
      return NextResponse.json({ resolved: n });
    }

    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const patch = { ...body };
    delete patch.id;
    const updated = await updateQuestion(id, patch);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 }
    );
  }
}
