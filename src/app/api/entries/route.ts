import { NextResponse } from "next/server";
import { deleteEntry, getEntries, storeKind, upsertEntry } from "@/lib/store";
import type { HandbookEntry } from "@/lib/types";

export async function GET() {
  const entries = await getEntries();
  return NextResponse.json(entries, { headers: { "x-store": storeKind() } });
}

const isoDate = (v: unknown): string | undefined =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<HandbookEntry>;
    if (!body.title || !body.content || !body.category) {
      return NextResponse.json(
        { error: "title, category, and content are required" },
        { status: 400 }
      );
    }
    const review = Number(body.reviewEveryDays);
    const entry: HandbookEntry = {
      id: body.id || `entry-${Date.now()}`,
      title: body.title,
      category: body.category,
      content: body.content,
      status: body.status === "draft" ? "draft" : "published",
      updatedAt: new Date().toISOString(),
      updatedBy: body.updatedBy || "Staff",
      effectiveFrom: isoDate(body.effectiveFrom),
      effectiveUntil: isoDate(body.effectiveUntil),
      reviewEveryDays: Number.isFinite(review) && review > 0 ? review : undefined,
    };
    await upsertEntry(entry);
    return NextResponse.json(entry);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteEntry(id);
  return NextResponse.json({ ok: true });
}
