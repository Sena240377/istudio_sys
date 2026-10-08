import { NextRequest } from "next/server";
import { db, jsonArray } from "@/lib/db";
import { errorResponse, noStore, requireSession } from "@/lib/auth";
import { ensureSlots, permittedStudentIds } from "@/lib/domain";

export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const viewer = session.user;
    await ensureSlots();
    const permitted = await permittedStudentIds(viewer);
    const bookingWhere =
      viewer.role === "STUDENT"
        ? { studentId: viewer.id }
        : viewer.role === "TA"
          ? { taId: viewer.id }
          : {};
    const recordWhere =
      viewer.role === "ADMIN"
        ? {}
        : viewer.role === "TA"
          ? { OR: [{ taId: viewer.id }, { studentId: { in: permitted } }] }
          : { studentId: { in: permitted } };
    const [
      courses,
      profiles,
      slots,
      bookings,
      records,
      surveys,
      notifications,
      interviews,
      users,
      settingRows,
      attempts,
      occupied,
    ] = await Promise.all([
      db.course.findMany({
        where: { active: true },
        include: { units: true },
        orderBy: { id: "asc" },
      }),
      db.taProfile.findMany({
        include: {
          user: { select: { id: true, name: true, active: true, role: true } },
        },
        orderBy: { userId: "asc" },
      }),
      db.slot.findMany({
        where: { start: { gt: new Date() } },
        orderBy: { start: "asc" },
      }),
      db.booking.findMany({ where: bookingWhere, orderBy: { start: "desc" } }),
      db.learningRecord.findMany({
        where: recordWhere,
        include: { booking: true },
        orderBy: { createdAt: "desc" },
      }),
      viewer.role === "TEACHER" || viewer.role === "TA"
        ? Promise.resolve([])
        : db.survey.findMany({
            where: viewer.role === "STUDENT" ? { studentId: viewer.id } : {},
            orderBy: { createdAt: "desc" },
          }),
      db.notification.findMany({
        where: { userId: viewer.id },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      viewer.role === "ADMIN"
        ? db.interview.findMany({ orderBy: { date: "desc" } })
        : Promise.resolve([]),
      db.user.findMany({
        select: { id: true, name: true, email: true, role: true, active: true },
        orderBy: { id: "asc" },
      }),
      db.setting.findMany(),
      viewer.role === "ADMIN"
        ? db.bookingAttempt.findMany()
        : viewer.role === "STUDENT"
          ? db.bookingAttempt.findMany({ where: { studentId: viewer.id } })
          : Promise.resolve([]),
      db.booking.findMany({
        where: {
          status: { in: ["BOOKED", "CHECKED_IN", "IN_PROGRESS"] },
          end: { gt: new Date() },
        },
        select: { taId: true, start: true, end: true },
      }),
    ]);
    const userMap = new Map(users.map((user) => [user.id, user]));
    const courseMap = new Map(courses.map((course) => [course.id, course]));
    function bookingDTO(booking: (typeof bookings)[number]) {
      const historyVisible =
        viewer.role !== "TEACHER" || permitted.includes(booking.studentId);
      const course = courseMap.get(booking.courseId);
      return {
        ...booking,
        studentId: historyVisible ? booking.studentId : null,
        studentName: historyVisible
          ? (userMap.get(booking.studentId)?.name ?? "削除済み")
          : "閲覧権限なし",
        question: historyVisible ? booking.question : "",
        studentInternalId: historyVisible ? booking.studentId : null,
        taName: booking.taId
          ? (userMap.get(booking.taId)?.name ?? "担当未確認")
          : booking.route === "TEACHER"
            ? "教員へ相談"
            : "一般相談受付",
        courseName: course?.name ?? "科目",
        unitName:
          course?.units.find((unit) => unit.id === booking.unitId)?.name ?? "",
        historyVisible,
      };
    }
    const settings: Record<string, unknown> = {
      targets: {},
      baseline: {},
      dataKind: "DEMO",
      baselinePeriod: "",
      targetPeriod: "",
    };
    for (const row of settingRows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        /* malformed persisted setting stays hidden */
      }
    }
    const accounts = viewer.role === "ADMIN" ? users : [];
    const students = ["ADMIN", "TEACHER", "TA"].includes(viewer.role)
      ? users
          .filter((u) => u.role === "STUDENT" && u.active)
          .map((u) => ({ id: u.id, name: u.name }))
      : [];
    const generalAvailability = Array.from(
      new Map(
        slots.map((s) => [
          s.start.toISOString(),
          {
            id: `general-${s.start.toISOString()}`,
            start: s.start,
            end: s.end,
          },
        ]),
      ).values(),
    ).filter(
      (s) =>
        occupied.filter(
          (b) => b.taId === null && b.start.getTime() === s.start.getTime(),
        ).length < 5,
    );
    return noStore({
      viewer: {
        id: viewer.id,
        name: viewer.name,
        role: viewer.role,
        email: viewer.email,
      },
      csrfToken: session.csrfToken,
      courses: courses.map((c) => ({
        ...c,
        units: c.units.filter((u) => u.active),
      })),
      tas: profiles
        .filter((p) => p.user.active && p.user.role === "TA")
        .map((p) => ({
          id: p.userId,
          name: p.user.name,
          subjects: jsonArray(p.subjects),
          expertise: jsonArray(p.expertise),
          units: jsonArray(p.units),
          present: p.present,
          confirmationState: "科目一致または予約ごとに確認",
          availability: slots
            .filter(
              (s) =>
                s.taId === p.userId &&
                !s.bookingId &&
                !occupied.some(
                  (b) =>
                    b.taId === p.userId && b.start < s.end && b.end > s.start,
                ),
            )
            .map((s) => ({ id: s.id, start: s.start, end: s.end })),
          shifts: "デモ公開シフト 09:00〜11:20 / 13:00〜17:05",
        })),
      generalAvailability,
      bookings: bookings.map(bookingDTO),
      records: records.map((record) => ({
        id: record.id,
        bookingId: record.bookingId,
        studentId: record.studentId,
        taId: record.taId,
        taName: userMap.get(record.taId ?? "")?.name ?? "一般相談",
        studentName: userMap.get(record.studentId)?.name ?? "学生",
        courseName: courseMap.get(record.booking.courseId)?.name ?? "",
        courseId: record.booking.courseId,
        unitName:
          courseMap
            .get(record.booking.courseId)
            ?.units.find((u) => u.id === record.booking.unitId)?.name ?? "",
        question: record.booking.question,
        taught: record.taught,
        understood: record.understood,
        unresolved: record.unresolved,
        handoff: record.handoff,
        effectiveMinutes: record.effectiveMinutes,
        preparation: record.booking.preparation,
        dataKind: record.dataKind,
        createdAt: record.createdAt,
      })),
      surveys,
      notifications,
      interviews,
      accounts,
      students,
      settings,
      bookingAttempts: attempts,
      historyGrants:
        viewer.role === "ADMIN" ? await db.historyGrant.findMany() : [],
      meta: {
        prototype: true,
        demoNotice:
          "全アカウント・予約・記録は架空の検証用データです。実際の利用者の声は登録されていません。",
        timezone: "Asia/Tokyo",
        durationMinutes: 35,
        serverTime: new Date().toISOString(),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
