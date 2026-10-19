import { NextResponse } from "next/server";
import { acknowledgeNotification, getNotifications } from "@/lib/store";

export async function GET() {
  const all = await getNotifications();
  return NextResponse.json(all.filter((n) => n.channel !== "admin-test"));
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await acknowledgeNotification(id);
  return NextResponse.json({ ok: true });
}
