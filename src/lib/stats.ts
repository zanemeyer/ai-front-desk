import { getQuestions } from "./store";
import type { Stats } from "./types";

export async function computeStats(): Promise<Stats> {
  const questions = await getQuestions();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = questions.filter(
    (q) => new Date(q.askedAt).getTime() >= weekAgo
  );
  const pool = thisWeek.length > 0 ? thisWeek : questions;
  const answered = pool.filter((q) => q.outcome === "answered").length;
  const escalated = pool.filter((q) => q.outcome === "escalation").length;
  const openGaps = questions.filter(
    (q) =>
      (q.outcome === "gap" || q.feedback === "down") && !q.resolved
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
    autoAnsweredPct: pool.length
      ? Math.round((answered / pool.length) * 100)
      : 0,
    escalated,
    openGaps,
    topTopics,
  };
}
