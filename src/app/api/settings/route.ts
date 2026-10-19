import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/store";
import type { Settings } from "@/lib/types";


export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as Settings;
    await saveSettings(body);
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 500 }
    );
  }
}
