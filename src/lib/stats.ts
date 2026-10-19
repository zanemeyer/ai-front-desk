import { getQuestions } from "./store";
import type { IntentCluster, QuestionLog, Stats } from "./types";

/** Conservative estimate of admin time per phone/email/text inquiry. */
export const MINUTES_PER_QUESTION = 3;

/** Operator-facing views ignore internal test traffic (eval runs, "Test it"). */
export const isRealTraffic = (q: QuestionLog) => q.channel !== "admin-test";

export async function computeStats(): Promise<Stats> {
  const questions = (await getQuestions()).filter(isRealTraffic);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = questions.filter((q) => new Date(q.askedAt).getTime() >= weekAgo);
  const pool = thisWeek.length > 0 ? thisWeek : questions;

  const answered = pool.filter((q) => q.outcome === "answered").length;
  const escalated = pool.filter((q) => q.outcome === "escalation").length;
  const openGaps = questions.filter(
    (q) => (q.outcome === "gap" || q.outcome === "stale_flag" || q.feedback === "down") && !q.resolved
  ).length;

  const topicCounts = new Map<string, number>();
  for (const q of pool) {
    const t = q.topic || "Other";
    topicCounts.set(t, (topicCounts.get(t) || 0) + 1);
  }
  const topTopics = [...topicCounts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    questionsThisWeek: thisWeek.length,
    autoAnsweredPct: pool.length ? Math.round((answered / pool.length) * 100) : 0,
    escalated,
    openGaps,
    hoursSavedThisWeek: Math.round(((answered * MINUTES_PER_QUESTION) / 60) * 10) / 10,
    minutesPerQuestion: MINUTES_PER_QUESTION,
    topTopics,
  };
}

function humanize(intent: string): string {
  return intent.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Group open "needs attention" items by normalized intent so three parents
 * asking about sibling discounts show up as one card with a count.
 */
export function clusterInbox(questions: QuestionLog[]): IntentCluster[] {
  const open = questions.filter(
    (q) =>
      isRealTraffic(q) &&
      !q.resolved &&
      (q.outcome === "gap" ||
        q.outcome === "escalation" ||
        q.outcome === "stale_flag" ||
        q.feedback === "down")
  );

  const map = new Map<string, IntentCluster>();
  for (const q of open) {
    const key = q.intent || `q:${q.id}`;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
      existing.items.push(q);
      if (q.askedAt > existing.lastAskedAt) existing.lastAskedAt = q.askedAt;
    } else {
      map.set(key, {
        intent: key,
        label: q.intent ? humanize(q.intent) : q.question,
        count: 1,
        outcome: q.feedback === "down" && q.outcome === "answered" ? "answered" : q.outcome,
        topic: q.topic || "Other",
        items: [q],
        lastAskedAt: q.askedAt,
      });
    }
  }
  return [...map.values()].sort((a, b) => {
    // Escalations first, then by count, then recency
    const rank = (c: IntentCluster) => (c.outcome === "escalation" ? 0 : 1);
    return rank(a) - rank(b) || b.count - a.count || b.lastAskedAt.localeCompare(a.lastAskedAt);
  });
}
