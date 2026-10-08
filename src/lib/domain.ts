import { db, jsonArray } from "./db";
import { ApiError } from "./auth";
import type { Booking, User, Prisma } from "@prisma/client";

export const ACTIVE_STATUSES = ["BOOKED", "CHECKED_IN", "IN_PROGRESS"];
export function matchLevel(
  subjects: string[],
  expertise: string[],
  course: { id: string; field: string },
): number {
  return subjects.includes(course.id)
    ? 1
    : expertise.includes(course.field)
      ? 2
      : 3;
}
export function tokyoDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
let generatedDay = "";
let generation: Promise<void> | undefined;
export function invalidateSlots() {
  generatedDay = "";
}
export async function ensureSlots() {
  const todayKey = tokyoDay();
  if (generatedDay === todayKey) return;
  if (generation) return generation;
  generation = generateSlots()
    .then(() => {
      generatedDay = todayKey;
    })
    .finally(() => {
      generation = undefined;
    });
  await generation;
}
async function generateSlots() {
  const profiles = await db.taProfile.findMany({
    include: { user: { select: { active: true, role: true } } },
  });
  const today = new Date(`${tokyoDay()}T00:00:00+09:00`);
  const candidates: { id: string; taId: string; start: Date; end: Date }[] = [];
  for (let day = 0; day < 8; day++) {
    const current = new Date(today.getTime() + day * 86_400_000);
    const key = tokyoDay(current);
    for (const p of profiles.filter(
      (p) => p.user.active && p.user.role === "TA",
    )) {
      // Demo published shifts. Operational shift configuration remains a future extension.
      for (const minute of [
        540, 575, 610, 645, 780, 815, 850, 885, 920, 955, 990,
      ]) {
        const start = new Date(current.getTime() + minute * 60_000);
        candidates.push({
          id: `${p.userId}-${key}-${minute}`,
          taId: p.userId,
          start,
          end: new Date(start.getTime() + 35 * 60_000),
        });
      }
    }
  }
  await db.$transaction(
    candidates.map((data) =>
      db.slot.upsert({ where: { id: data.id }, update: {}, create: data }),
    ),
  );
}
export async function permittedStudentIds(viewer: User) {
  if (viewer.role === "STUDENT") return [viewer.id];
  const grants = await db.historyGrant.findMany({
    where: { userId: viewer.id },
    select: { studentId: true },
  });
  if (viewer.role === "TA") {
    const assigned = await db.booking.findMany({
      where: { taId: viewer.id, status: { in: ACTIVE_STATUSES } },
      select: { studentId: true },
    });
    return [...new Set([...assigned, ...grants].map((g) => g.studentId))];
  }
  return grants.map((g) => g.studentId);
}
export function ownBooking(booking: Booking, user: User) {
  if (user.role === "ADMIN") return;
  if (user.role === "STUDENT" && booking.studentId === user.id) return;
  if (user.role === "TA" && booking.taId === user.id) return;
  throw new ApiError(403, "この予約を操作する権限がありません。");
}
export async function notifyBooking(
  tx: Prisma.TransactionClient,
  booking: Booking,
  message: string,
  includeStudent = false,
) {
  const recipients = new Set<string>();
  if (booking.taId) recipients.add(booking.taId);
  else
    for (const u of await tx.user.findMany({
      where: { role: { in: ["TEACHER", "ADMIN"] }, active: true },
      select: { id: true },
    }))
      recipients.add(u.id);
  if (includeStudent) recipients.add(booking.studentId);
  for (const userId of recipients)
    await tx.notification.create({
      data: { userId, bookingId: booking.id, message },
    });
}
export async function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  entityId?: string,
) {
  await tx.auditEvent.create({
    data: {
      actorId,
      action,
      entityId,
      detail:
        "検証用プロトタイプ操作。質問・学籍番号・発言本文は監査ログに保存しません。",
    },
  });
}
export async function transaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(fn, {
        timeout: 20_000,
        maxWait: 10_000,
        isolationLevel: "Serializable",
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (["P2034", "P1008", "P2028"].includes(code ?? "") && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 50 + attempt * 100));
        continue;
      }
      if (code === "P2002")
        throw new ApiError(
          409,
          "他の予約と競合しました。別の時間を選んでください。",
        );
      throw error;
    }
  }
  throw new ApiError(409, "予約が競合しました。再実行してください。");
}
export { jsonArray };
