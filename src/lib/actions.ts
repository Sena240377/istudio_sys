import type { Booking, Prisma, User } from "@prisma/client";
import { db, jsonArray } from "./db";
import { ApiError, requireRole } from "./auth";
import {
  ACTIVE_STATUSES,
  audit,
  invalidateSlots,
  matchLevel,
  notifyBooking,
  ownBooking,
  tokyoDay,
  transaction,
} from "./domain";
import { bool, date, id, integer, oneOf, str, strings } from "./validation";

type Body = Record<string, unknown>;
const roles = ["STUDENT", "TA", "TEACHER", "ADMIN"];
const dataKind = () => (process.env.DATA_KIND === "REAL" ? "REAL" : "DEMO");
async function loadBooking(tx: Prisma.TransactionClient, bookingId: unknown) {
  const booking = await tx.booking.findUnique({
    where: { id: id(bookingId, "予約ID") },
  });
  if (!booking) throw new ApiError(404, "予約が見つかりません。");
  return booking;
}
function requireAssigned(booking: Booking, user: User) {
  requireRole(user.role, ["TA", "ADMIN"]);
  ownBooking(booking, user);
}
async function validateCourse(tx: Prisma.TransactionClient, body: Body) {
  const course = await tx.course.findUnique({
    where: { id: id(body.courseId, "授業") },
  });
  if (!course?.active)
    throw new ApiError(400, "公開されている授業を選択してください。");
  const unitId = body.unitId ? id(body.unitId, "単元") : null;
  if (unitId) {
    const unit = await tx.unit.findUnique({ where: { id: unitId } });
    if (!unit?.active || unit.courseId !== course.id)
      throw new ApiError(400, "授業に対応する単元を選択してください。");
  }
  return { course, unitId };
}
async function checkOverlap(
  tx: Prisma.TransactionClient,
  studentId: string,
  taId: string | null,
  start: Date,
  end: Date,
) {
  const overlaps = await tx.booking.findFirst({
    where: {
      status: { in: ACTIVE_STATUSES },
      start: { lt: end },
      end: { gt: start },
      OR: [{ studentId }, ...(taId ? [{ taId }] : [])],
    },
  });
  if (overlaps)
    throw new ApiError(
      409,
      "学生または担当TAに重複する予約があります。別の時間を選んでください。",
    );
}
async function validateTa(
  tx: Prisma.TransactionClient,
  taId: string,
  course: { id: string; field: string },
) {
  const profile = await tx.taProfile.findUnique({
    where: { userId: taId },
    include: { user: true },
  });
  if (!profile || profile.user.role !== "TA" || !profile.user.active)
    throw new ApiError(400, "公開中のTAを選択してください。");
  return {
    profile,
    level: matchLevel(
      jsonArray(profile.subjects),
      jsonArray(profile.expertise),
      course,
    ),
  };
}
function requireActive(booking: Booking) {
  if (!ACTIVE_STATUSES.includes(booking.status))
    throw new ApiError(409, "この予約はすでに終了しています。");
}

export async function executeAction(
  user: User,
  body: Body,
): Promise<Record<string, unknown>> {
  const action = str(body.action, "操作", 80, true);
  if (action === "book") {
    requireRole(user.role, ["STUDENT"]);
    try {
      const result = await transaction(async (tx) => {
        const { course, unitId } = await validateCourse(tx, body);
        const mode = oneOf(body.mode, ["SIMPLE", "DETAILED"], "予約モード");
        const route = oneOf(
          body.route ?? "TA",
          ["TA", "GENERAL", "TEACHER"],
          "相談経路",
        );
        const question = str(body.question, "質問内容", 4000);
        let taId: string | null = null;
        let slotId: string | null = null;
        let level = 3;
        let start: Date;
        let end: Date;
        if (route === "TA") {
          taId = id(body.taId, "担当TA");
          const target = await validateTa(tx, taId, course);
          level = target.level;
          if (level === 3)
            throw new ApiError(
              400,
              "対応未確認のTAには自動で割り当てられません。一般相談または教員への相談を選択してください。",
            );
          const slot = await tx.slot.findUnique({
            where: { id: id(body.slotId, "予約時間") },
          });
          if (!slot || slot.taId !== taId || slot.bookingId)
            throw new ApiError(409, "この予約時間は選択できません。");
          start = slot.start;
          end = slot.end;
          slotId = slot.id;
        } else {
          if (body.taId)
            throw new ApiError(
              400,
              "一般相談・教員相談にはTAを自動で割り当てません。",
            );
          start = date(body.start, "相談日時");
          end = new Date(start.getTime() + 35 * 60_000);
          // The general/teacher desk uses published room opening slots, without inventing tutor capacity.
          const published = await tx.slot.findFirst({ where: { start, end } });
          if (!published)
            throw new ApiError(400, "公開された受付時間を選択してください。");
          const count = await tx.booking.count({
            where: { taId: null, start, status: { in: ACTIVE_STATUSES } },
          });
          if (count >= 5)
            throw new ApiError(
              409,
              "この受付時間の相談受付がいっぱいです。別の時間を選んでください。",
            );
        }
        if (
          start.getTime() <= Date.now() ||
          start.getTime() > Date.now() + 8 * 86_400_000
        )
          throw new ApiError(400, "予約日時を確認してください。");
        if (end.getTime() - start.getTime() !== 35 * 60_000)
          throw new ApiError(400, "予約枠は35分です。");
        await checkOverlap(tx, user.id, taId, start, end);
        const booking = await tx.booking.create({
          data: {
            studentId: user.id,
            taId,
            courseId: course.id,
            unitId,
            question,
            start,
            end,
            matchLevel: level,
            confirmation: level === 1 ? "CONFIRMED" : "PENDING",
            mode,
            route,
            slotId,
            dataKind: dataKind(),
          },
        });
        if (slotId) {
          const claimed = await tx.slot.updateMany({
            where: { id: slotId, bookingId: null },
            data: { bookingId: booking.id },
          });
          if (claimed.count !== 1)
            throw new ApiError(
              409,
              "別の学生が予約しました。時間を選び直してください。",
            );
        }
        await tx.bookingAttempt.create({
          data: { studentId: user.id, success: true, dataKind: dataKind() },
        });
        const sameDay = tokyoDay(start) === tokyoDay();
        await notifyBooking(
          tx,
          booking,
          `${sameDay ? "【当日・即時通知】" : ""}新しい予約：${course.name}（${mode === "DETAILED" ? "詳細相談あり" : "簡単予約"}）${level === 2 ? "。対応可否の確認をお願いします。" : ""}`,
        );
        await audit(tx, user.id, action, booking.id);
        return {
          ok: true,
          bookingId: booking.id,
          id: booking.id,
          confirmation: booking.confirmation,
        };
      });
      return result;
    } catch (error) {
      await db.bookingAttempt.create({
        data: { studentId: user.id, success: false, dataKind: dataKind() },
      });
      throw error;
    }
  }
  return transaction(async (tx) => {
    if (
      [
        "editBooking",
        "cancel",
        "checkIn",
        "confirmMatch",
        "preparation",
        "status",
        "assignBooking",
      ].includes(action)
    ) {
      const booking = await loadBooking(tx, body.id);
      if (action === "editBooking") {
        ownBooking(booking, user);
        requireActive(booking);
        if (booking.status !== "BOOKED")
          throw new ApiError(409, "来室前の予約だけ変更できます。");
        await tx.booking.update({
          where: { id: booking.id },
          data: { question: str(body.question, "質問内容", 4000) },
        });
        await notifyBooking(
          tx,
          booking,
          "予約内容が変更されました。事前確認をお願いします。",
          true,
        );
      }
      if (action === "cancel") {
        ownBooking(booking, user);
        requireActive(booking);
        if (booking.status === "IN_PROGRESS")
          throw new ApiError(409, "指導中はキャンセルできません。");
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: "CANCELLED", slotId: null },
        });
        await tx.slot.updateMany({
          where: { bookingId: booking.id },
          data: { bookingId: null },
        });
        await notifyBooking(tx, booking, "予約がキャンセルされました。", true);
      }
      if (action === "checkIn") {
        if (["TEACHER", "ADMIN"].includes(user.role)) {
          /* reception role */
        } else ownBooking(booking, user);
        if (booking.status !== "BOOKED")
          throw new ApiError(
            409,
            "予約済みの状態からチェックインしてください。",
          );
        if (tokyoDay(booking.start) !== tokyoDay())
          throw new ApiError(400, "予約当日にチェックインしてください。");
        if (booking.route === "TA" && booking.confirmation !== "CONFIRMED")
          throw new ApiError(409, "担当TAの対応確認後にチェックインできます。");
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: "CHECKED_IN", checkedInAt: new Date() },
        });
        await notifyBooking(tx, booking, "学生がチェックインしました。");
      }
      if (action === "confirmMatch") {
        requireAssigned(booking, user);
        requireActive(booking);
        if (booking.confirmation !== "PENDING")
          throw new ApiError(409, "この予約の対応確認は終了しています。");
        const accepted = bool(body.accepted, "対応可否");
        await tx.booking.update({
          where: { id: booking.id },
          data: { confirmation: accepted ? "CONFIRMED" : "DECLINED" },
        });
        await notifyBooking(
          tx,
          booking,
          accepted
            ? "担当TAが対応可能と確認しました。"
            : "担当TAが対応困難と確認しました。予約変更または一般相談をご検討ください。",
          true,
        );
      }
      if (action === "preparation") {
        requireAssigned(booking, user);
        requireActive(booking);
        await tx.booking.update({
          where: { id: booking.id },
          data: { preparation: bool(body.prepared, "準備状態") },
        });
      }
      if (action === "status") {
        requireAssigned(booking, user);
        const status = oneOf(
          body.status,
          ["IN_PROGRESS", "COMPLETED", "NO_SHOW"],
          "来室状態",
        );
        if (status === "IN_PROGRESS" && booking.status !== "CHECKED_IN")
          throw new ApiError(409, "チェックイン後に指導を開始してください。");
        if (status === "COMPLETED" && booking.status !== "IN_PROGRESS")
          throw new ApiError(409, "指導中の予約を完了できます。");
        if (
          status === "NO_SHOW" &&
          (booking.status !== "BOOKED" || booking.end.getTime() > Date.now())
        )
          throw new ApiError(
            409,
            "終了時間を過ぎた未来室予約を無断欠席にできます。",
          );
        if (booking.taId && booking.confirmation !== "CONFIRMED")
          throw new ApiError(409, "TAの対応確認が必要です。");
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            status,
            ...(status === "IN_PROGRESS"
              ? { startedAt: new Date() }
              : status === "COMPLETED"
                ? { completedAt: new Date() }
                : {}),
          },
        });
        if (status === "NO_SHOW")
          await tx.slot.updateMany({
            where: { bookingId: booking.id },
            data: { bookingId: null },
          });
        if (status === "COMPLETED")
          await notifyBooking(
            tx,
            booking,
            "指導が完了しました。任意の満足度アンケートに回答できます。",
            true,
          );
      }
      if (action === "assignBooking") {
        requireRole(user.role, ["TEACHER", "ADMIN"]);
        requireActive(booking);
        if (booking.taId)
          throw new ApiError(409, "担当のある予約は割り当て直せません。");
        const taId = id(body.taId, "TA");
        const course = await tx.course.findUnique({
          where: { id: booking.courseId },
        });
        if (!course) throw new ApiError(400, "授業を確認してください。");
        const target = await validateTa(tx, taId, course);
        if (!target.profile.present && booking.source === "WALK_IN")
          throw new ApiError(400, "在室中のTAを選択してください。");
        const published = await tx.slot.findFirst({
          where: {
            taId,
            start: booking.start,
            end: booking.end,
            bookingId: null,
          },
        });
        if (booking.source === "RESERVATION" && !published)
          throw new ApiError(409, "担当TAの公開予約時間がありません。");
        const conflicts = await tx.booking.findFirst({
          where: {
            taId,
            id: { not: booking.id },
            status: { in: ACTIVE_STATUSES },
            start: { lt: booking.end },
            end: { gt: booking.start },
          },
        });
        if (conflicts) throw new ApiError(409, "TAの指導時間が重複します。");
        const updated = await tx.booking.update({
          where: { id: booking.id },
          data: {
            taId,
            matchLevel: target.level,
            route: "TA",
            confirmation: target.level === 1 ? "CONFIRMED" : "PENDING",
            slotId: published?.id,
          },
        });
        if (published) {
          const count = await tx.slot.updateMany({
            where: { id: published.id, bookingId: null },
            data: { bookingId: booking.id },
          });
          if (count.count !== 1)
            throw new ApiError(409, "予約時間が競合しました。");
        }
        await notifyBooking(
          tx,
          updated,
          "受付から相談担当の確認依頼があります。",
          true,
        );
      }
      await audit(tx, user.id, action, booking.id);
      return { ok: true, bookingId: booking.id };
    }
    if (action === "readNotification") {
      const notificationId = id(body.id, "通知ID");
      const result = await tx.notification.updateMany({
        where: { id: notificationId, userId: user.id },
        data: { read: true },
      });
      if (!result.count) throw new ApiError(404, "通知が見つかりません。");
      return { ok: true };
    }
    if (action === "saveRecord") {
      const booking = await loadBooking(tx, body.bookingId);
      requireAssigned(booking, user);
      if (!["IN_PROGRESS", "COMPLETED"].includes(booking.status))
        throw new ApiError(409, "指導開始後に学習カルテを保存してください。");
      const record = {
        taught: str(body.taught, "指導内容", 6000, true),
        understood: str(body.understood, "理解できた部分", 6000),
        unresolved: str(body.unresolved, "未解決事項", 6000),
        handoff: str(body.handoff, "次回への引き継ぎ", 6000),
        effectiveMinutes: integer(body.effectiveMinutes, 0, 35, "有効指導時間"),
      };
      await tx.learningRecord.upsert({
        where: { bookingId: booking.id },
        create: {
          ...record,
          bookingId: booking.id,
          studentId: booking.studentId,
          taId: booking.taId,
          dataKind: booking.dataKind,
        },
        update: record,
      });
      await audit(tx, user.id, action, booking.id);
      return { ok: true };
    }
    if (action === "survey") {
      requireRole(user.role, ["STUDENT"]);
      const booking = await loadBooking(tx, body.bookingId);
      ownBooking(booking, user);
      if (booking.status !== "COMPLETED")
        throw new ApiError(409, "指導終了後に回答できます。");
      const survey = {
        satisfaction: integer(body.satisfaction, 1, 5, "満足度"),
        resolved: bool(body.resolved, "解決状況"),
        matched: bool(body.matched, "対応状況"),
        returnIntent: bool(body.returnIntent, "再利用意向"),
        comment: str(body.comment, "改善点", 4000),
      };
      await tx.survey.upsert({
        where: { bookingId: booking.id },
        create: {
          ...survey,
          bookingId: booking.id,
          studentId: user.id,
          dataKind: booking.dataKind,
        },
        update: survey,
      });
      await audit(tx, user.id, action, booking.id);
      return { ok: true };
    }
    if (action === "walkIn") {
      requireRole(user.role, ["TA", "TEACHER", "ADMIN"]);
      const studentId = id(body.studentId, "学生内部ID");
      const student = await tx.user.findUnique({ where: { id: studentId } });
      if (!student?.active || student.role !== "STUDENT")
        throw new ApiError(400, "有効な学生アカウントを選択してください。");
      const { course, unitId } = await validateCourse(tx, body);
      const start = new Date();
      const end = new Date(start.getTime() + 35 * 60_000);
      const taId = body.taId ? id(body.taId, "TA") : null;
      let level = 3;
      if (taId) {
        const target = await validateTa(tx, taId, course);
        level = target.level;
        if (!target.profile.present)
          throw new ApiError(400, "在室中のTAを選択してください。");
        if (level === 3)
          throw new ApiError(
            400,
            "対応未確認のTAは自動で割り当てず、一般相談として受付してください。",
          );
        const minutes =
          Number(
            new Intl.DateTimeFormat("en-GB", {
              timeZone: "Asia/Tokyo",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
              .format(start)
              .split(":")[0],
          ) *
            60 +
          Number(
            new Intl.DateTimeFormat("en-GB", {
              timeZone: "Asia/Tokyo",
              minute: "2-digit",
            }).format(start),
          );
        if (
          !(
            (minutes >= 540 && minutes + 35 <= 680) ||
            (minutes >= 780 && minutes + 35 <= 1025)
          )
        )
          throw new ApiError(400, "公開勤務時間内で受付してください。");
      }
      await checkOverlap(tx, studentId, taId, start, end);
      const booking = await tx.booking.create({
        data: {
          studentId,
          taId,
          courseId: course.id,
          unitId,
          question: str(body.question, "相談内容", 4000),
          start,
          end,
          matchLevel: level,
          confirmation: level === 1 ? "CONFIRMED" : "PENDING",
          mode: "SIMPLE",
          route: taId ? "TA" : "GENERAL",
          source: "WALK_IN",
          status: level === 2 ? "BOOKED" : "CHECKED_IN",
          checkedInAt: level === 2 ? null : start,
          dataKind: dataKind(),
        },
      });
      await notifyBooking(
        tx,
        booking,
        "【飛び込み・即時通知】来室受付を記録しました。",
      );
      await audit(tx, user.id, action, booking.id);
      return { ok: true, bookingId: booking.id };
    }
    if (action === "saveCourse") {
      requireRole(user.role, ["ADMIN"]);
      const courseId = body.id ? id(body.id, "授業ID") : undefined;
      const values = {
        name: str(body.name, "授業名", 100, true).trim(),
        field: str(body.field, "分野", 100, true).trim(),
      };
      const unitNames = strings(body.units, "単元", 30);
      const course = courseId
        ? await tx.course.update({ where: { id: courseId }, data: values })
        : await tx.course.create({ data: values });
      // Preserve unit identifiers already referenced by historical bookings.
      const existing = await tx.unit.findMany({
        where: { courseId: course.id },
      });
      await tx.unit.updateMany({
        where: { courseId: course.id },
        data: { active: false },
      });
      for (const name of unitNames) {
        const old = existing.find((unit) => unit.name === name);
        if (old)
          await tx.unit.update({
            where: { id: old.id },
            data: { active: true },
          });
        else await tx.unit.create({ data: { name, courseId: course.id } });
      }
      await audit(tx, user.id, action, course.id);
      return { ok: true, id: course.id };
    }
    if (action === "saveTa") {
      requireRole(user.role, ["TEACHER", "ADMIN"]);
      const taId = id(body.id, "TA");
      const ta = await tx.user.findUnique({ where: { id: taId } });
      if (!ta || ta.role !== "TA")
        throw new ApiError(400, "TAを選択してください。");
      const subjects = strings(body.subjects, "対応科目");
      const expertise = strings(body.expertise, "得意分野");
      const units = strings(body.units, "対応単元");
      const courseCount = await tx.course.count({
        where: { id: { in: subjects }, active: true },
      });
      if (courseCount !== subjects.length)
        throw new ApiError(400, "有効な授業を選択してください。");
      await tx.taProfile.upsert({
        where: { userId: taId },
        create: {
          userId: taId,
          subjects: JSON.stringify(subjects),
          expertise: JSON.stringify(expertise),
          units: JSON.stringify(units),
          present: bool(body.present, "在室状況"),
        },
        update: {
          subjects: JSON.stringify(subjects),
          expertise: JSON.stringify(expertise),
          units: JSON.stringify(units),
          present: bool(body.present, "在室状況"),
        },
      });
      await audit(tx, user.id, action, taId);
      return { ok: true };
    }
    if (action === "setPresence") {
      requireRole(user.role, ["TA", "TEACHER", "ADMIN"]);
      const taId = body.id ? id(body.id, "TA") : user.id;
      if (user.role === "TA" && user.id !== taId)
        throw new ApiError(403, "自身の在室状況だけ変更できます。");
      await tx.taProfile.update({
        where: { userId: taId },
        data: { present: bool(body.present, "在室状況") },
      });
      await audit(tx, user.id, action, taId);
      return { ok: true };
    }
    if (action === "saveInterview") {
      requireRole(user.role, ["ADMIN"]);
      const interview = await tx.interview.create({
        data: {
          date: date(body.date, "実施日"),
          category: oneOf(
            body.category,
            ["STUDENT", "TA", "TEACHER"],
            "対象者区分",
          ),
          question: str(body.question, "質問", 6000, true),
          answer: str(body.answer, "回答原文", 12000, true),
          operation: str(body.operation, "現在の運営方法", 6000),
          reason: str(body.reason, "採用理由", 6000),
          issue: str(body.issue, "課題", 6000),
          proposal: str(body.proposal, "改善案", 6000),
          quotePermission: oneOf(
            body.quotePermission,
            ["PENDING", "ALLOWED", "DENIED"],
            "引用許可",
          ),
          verification: oneOf(
            body.verification,
            ["UNVERIFIED", "INTERVIEW", "DATA"],
            "検証状況",
          ),
          createdBy: user.id,
          dataKind: dataKind(),
        },
      });
      await audit(tx, user.id, action, interview.id);
      return { ok: true, id: interview.id };
    }
    if (action === "settings") {
      requireRole(user.role, ["ADMIN"]);
      const accepted = new Set([
        "satisfaction",
        "mismatchRate",
        "bookingSuccessRate",
        "cancellationRate",
        "users",
        "resolutionRate",
        "preparationRate",
        "effectiveMinutes",
        "recordRate",
        "noShowRate",
        "mismatch",
        "success",
        "cancellation",
        "resolved",
        "prepared",
        "recorded",
      ]);
      for (const key of ["targets", "baseline"]) {
        const raw = body[key];
        if (raw === undefined) continue;
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
          throw new ApiError(400, "指標設定を確認してください。");
        const clean: Record<string, number> = {};
        for (const [metric, value] of Object.entries(raw)) {
          if (!accepted.has(metric))
            throw new ApiError(400, "未対応の指標です。");
          if (value === null || value === "") continue;
          const max =
            metric === "satisfaction"
              ? 5
              : metric === "effectiveMinutes"
                ? 35
                : metric === "users"
                  ? 1_000_000
                  : 100;
          if (
            typeof value !== "number" ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > max
          )
            throw new ApiError(400, "指標値を確認してください。");
          clean[metric] = value;
        }
        await tx.setting.upsert({
          where: { key },
          create: { key, value: JSON.stringify(clean) },
          update: { value: JSON.stringify(clean) },
        });
      }
      for (const key of ["baselinePeriod", "targetPeriod"])
        if (body[key] !== undefined) {
          const value = str(body[key], "集計期間", 150);
          await tx.setting.upsert({
            where: { key },
            create: { key, value: JSON.stringify(value) },
            update: { value: JSON.stringify(value) },
          });
        }
      await audit(tx, user.id, action);
      return { ok: true };
    }
    if (action === "saveAccount") {
      requireRole(user.role, ["ADMIN"]);
      const userId = id(body.id, "アカウント");
      const active = bool(body.active, "有効状態");
      const role = oneOf(body.role, roles, "権限");
      if (userId === user.id && (!active || role !== "ADMIN"))
        throw new ApiError(400, "自身の管理者権限は解除できません。");
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) throw new ApiError(404, "アカウントが見つかりません。");
      if (
        target.role !== role &&
        (await tx.booking.count({
          where: {
            status: { in: ACTIVE_STATUSES },
            OR: [{ studentId: userId }, { taId: userId }],
          },
        }))
      )
        throw new ApiError(409, "進行中の予約があるため権限を変更できません。");
      await tx.user.update({ where: { id: userId }, data: { active, role } });
      if (!active || target.role !== role)
        await tx.session.deleteMany({ where: { userId } });
      if (role === "TA") {
        await tx.taProfile.upsert({
          where: { userId },
          create: { userId },
          update: {},
        });
        invalidateSlots();
      }
      await audit(tx, user.id, action, userId);
      return { ok: true };
    }
    if (action === "grantHistory") {
      requireRole(user.role, ["ADMIN"]);
      const studentId = id(body.studentId, "学生");
      const userId = id(body.userId, "閲覧者");
      const [student, recipient] = await Promise.all([
        tx.user.findUnique({ where: { id: studentId } }),
        tx.user.findUnique({ where: { id: userId } }),
      ]);
      if (
        student?.role !== "STUDENT" ||
        !recipient?.active ||
        !["TA", "TEACHER"].includes(recipient.role)
      )
        throw new ApiError(400, "学生と閲覧者の組み合わせを確認してください。");
      if (body.revoke === true)
        await tx.historyGrant.deleteMany({ where: { studentId, userId } });
      else
        await tx.historyGrant.upsert({
          where: { studentId_userId: { studentId, userId } },
          create: { studentId, userId, grantedBy: user.id },
          update: { grantedBy: user.id },
        });
      await audit(tx, user.id, action, studentId);
      return { ok: true };
    }
    throw new ApiError(400, "未対応の操作です。");
  });
}
