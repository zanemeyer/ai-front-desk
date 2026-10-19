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
  /** ISO date (YYYY-MM-DD). Entry is only in effect on/after this date. */
  effectiveFrom?: string;
  /** ISO date (YYYY-MM-DD). Entry expires after this date and is excluded. */
  effectiveUntil?: string;
  /** If set, answers citing this entry carry a caveat once it is older than this. */
  reviewEveryDays?: number;
}

export type QuestionOutcome =
  | "answered"
  | "clarify"
  | "gap"
  | "escalation"
  | "stale_flag";

export type Confidence = "high" | "medium" | "low";

export type Channel = "web" | "sms" | "admin-test";

export interface QuestionLog {
  id: string;
  question: string;
  askedAt: string;
  outcome: QuestionOutcome;
  channel?: Channel;
  topic?: string;
  /** Normalized snake_case intent from the model, used to cluster the inbox. */
  intent?: string;
  answerPreview?: string;
  citedEntryIds?: string[];
  /** Citation IDs the model returned that did not exist in the handbook. */
  rejectedCitationIds?: string[];
  confidence?: Confidence;
  /** Model's own explanation of why it could or could not answer. */
  reason?: string;
  promptVersion?: string;
  feedback?: "up" | "down" | null;
  resolved?: boolean;
  resolvedEntryId?: string;
  escalationReason?: string;
  /** For stale_flag: the entry a parent reported as outdated. */
  flaggedEntryId?: string;
  notifiedAt?: string;
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

export interface StaffNotification {
  id: string;
  createdAt: string;
  questionId: string;
  question: string;
  topic: string;
  channel: Channel;
  /** How it was delivered in this prototype. */
  via: "log" | "email";
  acknowledged?: boolean;
}

export interface ChatTurn {
  role: "parent" | "frontdesk";
  text: string;
}

export interface AskResult {
  outcome: "answered" | "clarify" | "gap" | "escalation";
  answer: string;
  citedEntries: HandbookEntry[];
  /** Short notes shown under the answer (e.g. "menu last updated 9 days ago"). */
  caveats?: string[];
  /** For clarify: tappable options. */
  clarificationOptions?: string[];
  confidence?: Confidence;
  questionId: string;
  escalationReason?: string;
  /** For escalation: true when staff were pinged automatically. */
  staffNotified?: boolean;
  director?: DirectorContact;
  promptVersion?: string;
}

export interface Stats {
  questionsThisWeek: number;
  autoAnsweredPct: number;
  escalated: number;
  openGaps: number;
  /** answered × minutes-per-question / 60, this week. */
  hoursSavedThisWeek: number;
  minutesPerQuestion: number;
  topTopics: { topic: string; count: number }[];
}

export interface IntentCluster {
  intent: string;
  label: string;
  count: number;
  outcome: QuestionOutcome;
  topic: string;
  items: QuestionLog[];
  lastAskedAt: string;
}
