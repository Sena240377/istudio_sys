export type Role = "STUDENT" | "TA" | "TEACHER" | "ADMIN";
export type Viewer = { id: string; name: string; role: Role; email: string };
export type Course = {
  id: string;
  name: string;
  field: string;
  units: { id: string; name: string }[];
};
export type Ta = {
  id: string;
  name: string;
  subjects: string[];
  expertise: string[];
  units: string[];
  present: boolean;
  availability: { id: string; start: string; end: string }[];
};
export type Booking = {
  id: string;
  studentId: string;
  studentName: string;
  taId: string | null;
  taName: string | null;
  courseId: string;
  courseName: string;
  unitId?: string;
  unitName?: string;
  question: string;
  start: string;
  end: string;
  status: string;
  matchLevel: number;
  confirmation: string;
  mode: string;
  source: string;
  dataKind: string;
  checkedInAt?: string;
  preparation: boolean | null;
  createdAt: string;
  route?: string;
};
export type LearningRecord = {
  id: string;
  bookingId: string;
  studentId: string;
  courseName: string;
  taName: string;
  unitName?: string;
  question?: string;
  taught: string;
  understood: string;
  unresolved: string;
  handoff: string;
  createdAt: string;
  effectiveMinutes: number;
  dataKind: string;
};
export type Survey = {
  id: string;
  bookingId: string;
  studentId: string;
  satisfaction: number;
  resolved: boolean;
  matched: boolean;
  returnIntent: boolean;
  comment: string;
  createdAt: string;
  dataKind: string;
};
export type Notification = {
  id: string;
  message: string;
  read: boolean;
  createdAt: string;
  bookingId: string;
};
export type Interview = {
  id: string;
  date: string;
  category: string;
  question: string;
  answer: string;
  operation: string;
  reason: string;
  issue: string;
  proposal: string;
  quotePermission: string;
  verification: string;
  dataKind?: string;
};
export type Account = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
};
export type MetricSettings = Record<string, number>;
export type AppData = {
  viewer: Viewer;
  csrfToken: string;
  courses: Course[];
  tas: Ta[];
  generalAvailability?: { id: string; start: string; end: string }[];
  bookings: Booking[];
  notifications: Notification[];
  records: LearningRecord[];
  surveys: Survey[];
  interviews: Interview[];
  accounts?: Account[];
  students?: { id: string; name: string }[];
  bookingAttempts?: {
    id: string;
    createdAt: string;
    success: boolean;
    dataKind: string;
  }[];
  settings: {
    targets: MetricSettings;
    baseline: MetricSettings;
    baselinePeriod?: string;
    targetPeriod?: string;
  };
};
export type Action = (
  action: string,
  payload?: Record<string, unknown>,
) => Promise<boolean>;
export const roles: Record<Role, string> = {
  STUDENT: "学生",
  TA: "TA",
  TEACHER: "教員",
  ADMIN: "管理者",
};
export const statuses: Record<string, string> = {
  PENDING: "対応確認待ち",
  BOOKED: "予約済み",
  RESERVED: "予約済み",
  CONFIRMED: "予約済み",
  CHECKED_IN: "チェックイン済み",
  IN_PROGRESS: "指導中",
  COMPLETED: "指導完了",
  CANCELLED: "キャンセル",
  NO_SHOW: "無断欠席",
  REJECTED: "対応不可・再相談",
};
export const activeStatuses = [
  "BOOKED",
  "RESERVED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
];
export function match(ta: Ta, course?: Course) {
  if (!course) return 0;
  return ta.subjects.includes(course.id)
    ? 1
    : ta.expertise.includes(course.field)
      ? 2
      : 3;
}
export function fieldLabel(value: string) {
  return (
    (
      {
        COMPUTING: "プログラミング",
        MATHEMATICS: "数学",
        STATISTICS: "統計・データ分析",
        DATABASE: "データベース",
      } as Record<string, string>
    )[value] || value
  );
}
export function day(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value));
}
export function time(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
export function dateKey(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function isToday(value: string) {
  return dateKey(value) === dateKey(new Date().toISOString());
}
