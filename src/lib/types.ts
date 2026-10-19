export type EntryStatus = "published" | "draft";

export type HandbookCategory =
  | "Hours & Closures"
  | "Tuition & Billing"
  | "Health & Illness"
  | "Meals"
  | "Enrollment & Tours"
  | "Daily Schedule"
  | "Drop-off & Pickup"
  | "Weather";

export interface HandbookEntry {
  id: string;
  category: HandbookCategory | string;
  title: string;
  content: string;
  status: EntryStatus;
  updatedAt: string;
  updatedBy: string;
}

export type QuestionOutcome =
  | "answered"
  | "gap"
  | "escalation"
  | "thumbs_down";

export type Confidence = "high" | "medium" | "low";

export interface QuestionLog {
  id: string;
  question: string;
  askedAt: string;
  outcome: QuestionOutcome;
  topic?: string;
  answerPreview?: string;
  citedEntryIds?: string[];
  confidence?: Confidence;
  feedback?: "up" | "down" | null;
  resolved?: boolean;
  resolvedEntryId?: string;
  escalationReason?: string;
}

export interface DirectorContact {
  name: string;
  phone: string;
  email: string;
}

export interface Settings {
  sensitiveTopics: string[];
  director: DirectorContact;
  centerName: string;
}

export interface AskResult {
  outcome: "answered" | "gap" | "escalation";
  answer: string;
  citedEntries: HandbookEntry[];
  confidence?: Confidence;
  questionId: string;
  escalationReason?: string;
  director?: DirectorContact;
}

export interface Stats {
  questionsThisWeek: number;
  autoAnsweredPct: number;
  escalated: number;
  openGaps: number;
  topTopics: { topic: string; count: number }[];
}
