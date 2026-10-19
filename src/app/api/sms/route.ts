import { NextResponse } from "next/server";
import { askQuestion } from "@/lib/ask";

/**
 * Twilio inbound SMS webhook. Point a Twilio number's "A message comes in"
 * webhook at POST /api/sms. Twilio sends application/x-www-form-urlencoded
 * with Body and From; we reply with TwiML.
 *
 * Prototype note: request signature validation (X-Twilio-Signature) is
 * skipped; add it before exposing this publicly for a real center.
 */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function twiml(message: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
  return new Response(xml, { headers: { "Content-Type": "text/xml" } });
}

export async function POST(req: Request) {
  let body = "";
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const j = await req.json();
    body = String(j.Body ?? j.body ?? "");
  } else {
    const form = await req.formData();
    body = String(form.get("Body") ?? "");
  }
  if (!body.trim()) return twiml("Hi! Text me a question about hours, tuition, meals, or tours.");

  try {
    const result = await askQuestion(body, { channel: "sms" });
    let text = result.answer;
    if (result.outcome === "clarify" && result.clarificationOptions?.length) {
      text += ` Reply with one of: ${result.clarificationOptions.join(", ")}.`;
    }
    if (result.caveats?.length) text += ` (${result.caveats[0]})`;
    if (result.outcome === "answered" && result.citedEntries.length) {
      text += ` — Source: ${result.citedEntries[0].title}`;
    }
    // SMS segments are 160 chars; keep replies to ~3 segments.
    return twiml(text.slice(0, 480));
  } catch (err) {
    console.error(err);
    return twiml("Sorry, I couldn't look that up right now. The office will follow up.");
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST application/x-www-form-urlencoded with Body=<question> (Twilio webhook shape)",
  });
}
