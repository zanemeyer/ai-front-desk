import { randomUUID } from "crypto";
import { addNotification } from "./store";
import type { Channel, DirectorContact, StaffNotification } from "./types";

/**
 * Staff notification on escalation. In this prototype the notification is
 * persisted and shown in the operator "Staff alerts" panel; if RESEND_API_KEY
 * is set it is also emailed to the director. In production this would be a
 * brightwheel staff message / push.
 */
export async function notifyStaff(args: {
  questionId: string;
  question: string;
  topic: string;
  channel: Channel;
  director: DirectorContact;
  centerName: string;
}): Promise<StaffNotification> {
  const { questionId, question, topic, channel, director, centerName } = args;
  let via: StaffNotification["via"] = "log";

  const key = process.env.RESEND_API_KEY;
  if (key) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.NOTIFY_FROM || "AI Front Desk <onboarding@resend.dev>",
          to: [director.email],
          subject: `[${centerName}] Parent needs you: ${topic}`,
          text: `A parent message was escalated to you.\n\nTopic: ${topic}\nChannel: ${channel}\n\n"${question}"\n\nOpen the control center to respond.`,
        }),
      });
      if (res.ok) via = "email";
      else console.warn("Resend failed:", res.status, await res.text());
    } catch (err) {
      console.warn("Resend error:", err);
    }
  } else {
    console.info(`[notify] ${director.name} <${director.email}>: ${topic} — "${question}"`);
  }

  return addNotification({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    questionId,
    question,
    topic,
    channel,
    via,
    acknowledged: false,
  });
}
