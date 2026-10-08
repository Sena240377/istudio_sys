import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const base = (process.env.ISTUDIO_BASE_URL || "http://127.0.0.1:3001").replace(
  /\/$/,
  "",
);
const target = new URL(base);
if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname))
  throw new Error("統合テストは loopback の隔離環境に限ります。");
if (process.env.ISTUDIO_TEST_WRITE !== "isolated-demo")
  throw new Error(
    "破棄可能な隔離 DB を起動し、ISTUDIO_TEST_WRITE=isolated-demo を設定してください。",
  );
const results = [];
const startedAt = new Date().toISOString();
const databaseLabel = process.env.ISTUDIO_TEST_DATABASE || "test.db";
const fixture = {};
const sessions = {};
const isoDay = (value) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

async function request(
  session,
  endpoint,
  {
    method = "GET",
    body,
    csrf = true,
    origin = base,
    raw = false,
    extraHeaders = {},
  } = {},
) {
  const headers = {
    ...(session?.cookie ? { Cookie: session.cookie } : {}),
    ...extraHeaders,
  };
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    if (origin !== null) headers.Origin = origin;
    if (csrf && session?.csrfToken) headers["X-CSRF-Token"] = session.csrfToken;
  }
  const response = await fetch(`${base}${endpoint}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let data = text;
  if (!raw) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: `JSON ではない応答 (${response.status})` };
    }
  }
  return { status: response.status, data, headers: response.headers };
}
// fetch は Host を URL の接続先で上書きするため、偽装 Host の検証だけ raw HTTP を使う。
async function rawHostRequest(session, endpoint, body) {
  const method = body ? "POST" : "GET";
  const transport = target.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const headers = {
      Host: "evil.example.test:3001",
      ...(session?.cookie ? { Cookie: session.cookie } : {}),
    };
    if (body) {
      headers["Content-Type"] = "application/json";
      headers.Origin = "http://evil.example.test:3001";
    }
    const req = transport(
      new URL(endpoint, `${base}/`),
      { method, headers, timeout: 10_000 },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          let data;
          try {
            data = JSON.parse(text);
          } catch {
            data = { error: "JSON ではない応答" };
          }
          resolve({ status: response.statusCode, data });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () =>
      req.destroy(new Error("Host 検証の HTTP タイムアウト")),
    );
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
function ok(response, expected = 200) {
  assert.equal(
    response.status,
    expected,
    typeof response.data?.error === "string"
      ? response.data.error
      : `HTTP ${response.status}`,
  );
  return response.data;
}
async function refresh(session) {
  const data = ok(await request(session, "/api/data"));
  session.csrfToken = data.csrfToken;
  session.data = data;
  return data;
}
async function login(name) {
  const response = await request(null, "/api/auth", {
    method: "POST",
    body: { email: `${name}@example.test`, password: "Demo2026!" },
  });
  ok(response);
  const cookies = response.headers.getSetCookie();
  const cookie = cookies
    .find((value) => value.startsWith("istudio_session="))
    ?.split(";")[0];
  assert.ok(cookie, "セッション Cookie がない");
  assert.ok(
    cookies.some(
      (value) => /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value),
    ),
    "Cookie の保護属性がない",
  );
  const session = { cookie, csrfToken: "", data: null };
  await refresh(session);
  assert.equal(session.data.viewer.email, `${name}@example.test`);
  sessions[name] = session;
  return session;
}
async function action(session, name, body = {}) {
  return request(session, "/api/action", {
    method: "POST",
    body: { action: name, ...body },
  });
}
async function available(session, taId, { today = false, others = [] } = {}) {
  const data = await refresh(session);
  const allBookings = [...data.bookings];
  for (const other of others)
    allBookings.push(...(await refresh(other)).bookings);
  const day = isoDay(data.meta.serverTime);
  const ta = data.tas.find((item) => item.id === taId);
  assert.ok(ta, `TA ${taId} が公開されていない`);
  const slots = ta.availability.filter((slot) =>
    today ? isoDay(slot.start) === day : isoDay(slot.start) !== day,
  );
  const slot = slots.find(
    (candidate) =>
      !allBookings.some(
        (booking) =>
          ["BOOKED", "CHECKED_IN", "IN_PROGRESS"].includes(booking.status) &&
          new Date(booking.start) < new Date(candidate.end) &&
          new Date(booking.end) > new Date(candidate.start),
      ),
  );
  assert.ok(
    slot,
    today
      ? "当日の空き枠がない。開室時間内に再実行してください。"
      : "隔離データに利用可能な空き枠がない",
  );
  return slot;
}
async function getBooking(session, id) {
  const booking = (await refresh(session)).bookings.find(
    (item) => item.id === id,
  );
  assert.ok(booking, "保存した予約が参照できない");
  return booking;
}
async function test(id, name, fn) {
  const time = Date.now();
  try {
    await fn();
    results.push({ id, name, status: "PASS", durationMs: Date.now() - time });
    console.log(`PASS ${id}: ${name}`);
  } catch (error) {
    const reason = String(error?.message || error).slice(0, 1200);
    results.push({
      id,
      name,
      status: "FAIL",
      durationMs: Date.now() - time,
      reason,
    });
    console.error(`FAIL ${id}: ${name} — ${reason}`);
  }
}

try {
  for (const name of [
    "admin",
    "student1",
    "student2",
    "student3",
    "student4",
    "student5",
    "ta1",
    "ta2",
    "ta5",
    "teacher",
  ])
    await login(name);
  const initial = sessions.admin.data;
  assert.equal(initial.meta.prototype, true, "検証用プロトタイプではない");
  assert.equal(initial.meta.durationMinutes, 35);
  assert.ok(
    initial.bookings.every((booking) => booking.dataKind === "DEMO"),
    "REAL を含む環境ではテストを停止する",
  );
  assert.ok(initial.records.every((record) => record.dataKind === "DEMO"));
  assert.ok(initial.surveys.every((survey) => survey.dataKind === "DEMO"));
  assert.equal(
    initial.accounts.filter((account) => account.role === "STUDENT").length,
    5,
  );
  assert.equal(
    initial.accounts.filter((account) => account.role === "TA").length,
    5,
  );

  await test(
    1,
    "学生が科目と TA の対応科目・単元・空き枠を取得できる",
    async () => {
      const data = await refresh(sessions.student1);
      const course = data.courses.find((item) => item.id === "c-program");
      assert.ok(course?.units.length);
      assert.ok(
        data.tas
          .find((item) => item.id === "ta1")
          ?.subjects.includes(course.id),
      );
      assert.ok(
        data.tas.every(
          (ta) => Array.isArray(ta.units) && Array.isArray(ta.availability),
        ),
      );
      assert.ok(data.tas.every((ta) => !("passwordHash" in ta)));
    },
  );
  await test(
    2,
    "完全一致 TA に予約し、サーバーがレベル 1 と確認済みを保存する",
    async () => {
      const slot = await available(sessions.student1, "ta1", { today: true });
      const data = ok(
        await action(sessions.student1, "book", {
          courseId: "c-program",
          taId: "ta1",
          slotId: slot.id,
          mode: "SIMPLE",
        }),
      );
      fixture.easy = data.bookingId;
      const booking = await getBooking(sessions.student1, fixture.easy);
      assert.equal(booking.matchLevel, 1);
      assert.equal(booking.confirmation, "CONFIRMED");
      assert.equal(booking.status, "BOOKED");
      assert.equal(
        new Date(booking.end) - new Date(booking.start),
        35 * 60_000,
      );
    },
  );
  await test(
    3,
    "関連分野 TA はレベル 2・対応確認待ちとなり TA が承認できる",
    async () => {
      const slot = await available(sessions.student2, "ta2");
      const response = ok(
        await action(sessions.student2, "book", {
          courseId: "c-program",
          taId: "ta2",
          slotId: slot.id,
          mode: "SIMPLE",
        }),
      );
      fixture.related = response.bookingId;
      let booking = await getBooking(sessions.student2, fixture.related);
      assert.equal(booking.matchLevel, 2);
      assert.equal(booking.confirmation, "PENDING");
      ok(
        await action(sessions.ta2, "confirmMatch", {
          id: fixture.related,
          accepted: true,
        }),
      );
      booking = await getBooking(sessions.student2, fixture.related);
      assert.equal(booking.confirmation, "CONFIRMED");
    },
  );
  await test(
    4,
    "完全一致がなくても一般・教員相談を受け付け、未確認 TA の自動割当を防ぐ",
    async () => {
      const courseId = "c-java";
      assert.ok(
        (await refresh(sessions.student3)).tas.every(
          (ta) => !ta.subjects.includes(courseId),
        ),
        "完全一致 TA のない科目を使って検証する",
      );
      const slot = await available(sessions.student3, "ta5");
      ok(
        await action(sessions.student3, "book", {
          courseId,
          taId: "ta5",
          slotId: slot.id,
          mode: "SIMPLE",
        }),
        400,
      );
      const response = ok(
        await action(sessions.student3, "book", {
          courseId,
          route: "GENERAL",
          start: slot.start,
          mode: "SIMPLE",
        }),
      );
      fixture.general = response.bookingId;
      const booking = await getBooking(sessions.student3, fixture.general);
      assert.equal(booking.taId, null);
      assert.equal(booking.matchLevel, 3);
      assert.equal(booking.route, "GENERAL");
      const nextSlot = await available(sessions.student3, "ta5");
      const teacherResponse = ok(
        await action(sessions.student3, "book", {
          courseId,
          route: "TEACHER",
          start: nextSlot.start,
          mode: "SIMPLE",
        }),
      );
      assert.equal(
        (await getBooking(sessions.student3, teacherResponse.bookingId)).taId,
        null,
      );
    },
  );
  await test(5, "科目と日時だけの簡単予約が永続化される", async () => {
    const booking = await getBooking(sessions.student1, fixture.easy);
    assert.equal(booking.mode, "SIMPLE");
    assert.equal(booking.question, "");
    assert.equal(booking.unitId, null);
  });
  await test(6, "単元・具体的な質問を含む詳細予約を保存する", async () => {
    const data = await refresh(sessions.student1);
    const unit = data.courses.find((course) => course.id === "c-program")
      .units[0];
    const slot = await available(sessions.student1, "ta1");
    const response = ok(
      await action(sessions.student1, "book", {
        courseId: "c-program",
        unitId: unit.id,
        question: "【統合テスト・架空】繰り返しの終了条件を確認したい。",
        taId: "ta1",
        slotId: slot.id,
        mode: "DETAILED",
      }),
    );
    fixture.detailed = response.bookingId;
    const booking = await getBooking(sessions.student1, fixture.detailed);
    assert.equal(booking.mode, "DETAILED");
    assert.equal(booking.unitId, unit.id);
    assert.ok(booking.question.includes("終了条件"));
  });
  await test(7, "同一 TA・同一枠への同時予約は 1 件だけ成功する", async () => {
    const data = await refresh(sessions.student4);
    const ta = data.tas.find((item) => item.id === "ta4");
    const slot = await available(sessions.student4, "ta4", {
      others: [sessions.student5],
    });
    const payload = {
      courseId: ta.subjects[0],
      taId: "ta4",
      slotId: slot.id,
      mode: "SIMPLE",
    };
    const responses = await Promise.all([
      action(sessions.student4, "book", payload),
      action(sessions.student5, "book", payload),
    ]);
    assert.deepEqual(
      responses.map((response) => response.status).sort(),
      [200, 409],
    );
    const bookings = (await refresh(sessions.admin)).bookings.filter(
      (booking) => booking.slotId === slot.id && booking.status === "BOOKED",
    );
    assert.equal(bookings.length, 1);
  });
  await test(
    8,
    "当日予約通知が TA に即時保存され、確認状態を更新できる",
    async () => {
      const data = await refresh(sessions.ta1);
      const notification = data.notifications.find(
        (item) =>
          item.bookingId === fixture.easy && item.message.includes("当日"),
      );
      assert.ok(notification);
      assert.equal(notification.read, false);
      ok(
        await action(sessions.ta1, "readNotification", { id: notification.id }),
      );
      assert.equal(
        (await refresh(sessions.ta1)).notifications.find(
          (item) => item.id === notification.id,
        ).read,
        true,
      );
    },
  );
  await test(
    9,
    "学生が予約当日にチェックインし来室日時を保存する",
    async () => {
      ok(await action(sessions.student1, "checkIn", { id: fixture.easy }));
      const booking = await getBooking(sessions.student1, fixture.easy);
      assert.equal(booking.status, "CHECKED_IN");
      assert.ok(booking.checkedInAt);
    },
  );
  await test(
    10,
    "担当 TA が準備・指導開始・カルテ・指導完了を保存する",
    async () => {
      ok(
        await action(sessions.ta1, "preparation", {
          id: fixture.easy,
          prepared: true,
        }),
      );
      ok(
        await action(sessions.ta1, "status", {
          id: fixture.easy,
          status: "IN_PROGRESS",
        }),
      );
      ok(
        await action(sessions.ta1, "saveRecord", {
          bookingId: fixture.easy,
          taught: "【統合テスト・架空】終了条件を図で確認した。",
          understood: "条件が偽になると終了する。",
          unresolved: "入れ子のループは次回確認。",
          handoff: "図を使って復習する。",
          effectiveMinutes: 30,
        }),
      );
      const record = (await refresh(sessions.ta1)).records.find(
        (item) => item.bookingId === fixture.easy,
      );
      assert.ok(record?.taught.includes("終了条件"));
      assert.equal(record.effectiveMinutes, 30);
      fixture.record = record.id;
      ok(
        await action(sessions.ta1, "status", {
          id: fixture.easy,
          status: "COMPLETED",
        }),
      );
      const booking = await getBooking(sessions.student1, fixture.easy);
      assert.equal(booking.status, "COMPLETED");
      assert.equal(booking.preparation, true);
    },
  );
  await test(
    11,
    "他の学生・担当外 TA のカルテ直接閲覧と更新を拒否する",
    async () => {
      assert.ok(fixture.record, "検証するカルテが未作成");
      ok(
        await request(sessions.student2, `/api/records/${fixture.record}`),
        403,
      );
      ok(await request(sessions.ta5, `/api/records/${fixture.record}`), 403);
      assert.ok(
        !(await refresh(sessions.student2)).records.some(
          (item) => item.id === fixture.record,
        ),
      );
      ok(
        await action(sessions.ta5, "saveRecord", {
          bookingId: fixture.easy,
          taught: "変更を拒否する確認",
          effectiveMinutes: 1,
        }),
        403,
      );
    },
  );
  await test(
    12,
    "指導完了後に学生が任意アンケートへ回答し保存する",
    async () => {
      ok(
        await action(sessions.student1, "survey", {
          bookingId: fixture.easy,
          satisfaction: 5,
          resolved: true,
          matched: true,
          returnIntent: true,
          comment: "【統合テスト・架空】図がわかりやすかった。",
        }),
      );
      const survey = (await refresh(sessions.student1)).surveys.find(
        (item) => item.bookingId === fixture.easy,
      );
      assert.equal(survey.satisfaction, 5);
      assert.equal(survey.resolved, true);
      assert.equal(survey.dataKind, "DEMO");
    },
  );
  await test(
    13,
    "管理者が予約・来室・指導品質・試行数を集計 CSV で確認する",
    async () => {
      const data = await refresh(sessions.admin);
      assert.ok(
        data.bookings.some(
          (item) => item.id === fixture.easy && item.checkedInAt,
        ),
      );
      assert.ok(
        data.bookingAttempts.some((item) => item.success) &&
          data.bookingAttempts.some((item) => !item.success),
      );
      const csv = ok(
        await request(
          sessions.admin,
          "/api/export?kind=metrics&dataKind=DEMO",
          { raw: true },
        ),
      );
      assert.ok(
        csv.includes("学生満足度") &&
          csv.includes("予約受付成立率") &&
          csv.includes("分母"),
      );
      assert.ok(csv.includes("架空デモデータ"));
    },
  );
  await test(14, "ヒアリング原文・引用許可・未検証状態を保持する", async () => {
    fixture.quote =
      "【自動テストの架空文】\n「今の受付で助かった」\n  原文の空白を保持する。";
    const response = ok(
      await action(sessions.admin, "saveInterview", {
        date: `${isoDay(new Date())}T10:00:00+09:00`,
        category: "STUDENT",
        question: "【架空・テスト】便利な点は？",
        answer: fixture.quote,
        operation: "【架空】対面受付",
        reason: "要ヒアリング",
        issue: "未確認の仮説",
        proposal: "現場への確認",
        quotePermission: "DENIED",
        verification: "UNVERIFIED",
      }),
    );
    fixture.interview = response.id;
    const interview = (await refresh(sessions.admin)).interviews.find(
      (item) => item.id === fixture.interview,
    );
    assert.equal(interview.answer, fixture.quote);
    assert.equal(interview.quotePermission, "DENIED");
    assert.equal(interview.verification, "UNVERIFIED");
    const csv = ok(
      await request(
        sessions.admin,
        "/api/export?kind=interviews&dataKind=DEMO",
        { raw: true },
      ),
    );
    assert.ok(
      !csv.includes("原文の空白を保持する。"),
      "引用不許可の原文が発表用出力に含まれる",
    );
  });
  await test(15, "デモと実測を区別し導入前未取得を保持する", async () => {
    const data = await refresh(sessions.admin);
    assert.ok(data.bookings.every((item) => item.dataKind === "DEMO"));
    assert.ok(data.records.every((item) => item.dataKind === "DEMO"));
    assert.deepEqual(data.settings.baseline, {});
    assert.deepEqual(data.settings.targets, {});
    const csv = ok(
      await request(sessions.admin, "/api/export?kind=metrics&dataKind=REAL", {
        raw: true,
      }),
    );
    assert.ok(csv.includes("実測データ") && csv.includes("未取得"));
    assert.ok(!csv.includes("架空デモデータ"));
  });
  await test(
    16,
    "未認証・偽セッション・CSRF 欠落・異なる Origin を拒否する",
    async () => {
      ok(await request(null, "/api/data"), 401);
      ok(
        await request({ cookie: "istudio_session=fake-token" }, "/api/data"),
        401,
      );
      ok(
        await request(sessions.student1, "/api/action", {
          method: "POST",
          csrf: false,
          body: {
            action: "editBooking",
            id: fixture.detailed,
            question: "拒否確認",
          },
        }),
        403,
      );
      ok(
        await request(sessions.student1, "/api/action", {
          method: "POST",
          origin: "https://invalid.example.test",
          body: { action: "cancel", id: fixture.detailed },
        }),
        403,
      );
      assert.ok(
        (
          await getBooking(sessions.student1, fixture.detailed)
        ).question.includes("終了条件"),
      );
    },
  );
  await test(
    17,
    "学生による管理設定・他人予約操作・CSV 出力を拒否する",
    async () => {
      ok(
        await action(sessions.student1, "settings", {
          targets: { satisfaction: 5 },
        }),
        403,
      );
      ok(
        await action(sessions.student2, "cancel", { id: fixture.detailed }),
        403,
      );
      ok(await request(sessions.student1, "/api/export?kind=metrics"), 403);
    },
  );
  await test(
    18,
    "未来のチェックイン・範囲外満足度・異なる科目の単元を拒否する",
    async () => {
      ok(
        await action(sessions.student1, "checkIn", { id: fixture.detailed }),
        400,
      );
      ok(
        await action(sessions.student1, "survey", {
          bookingId: fixture.easy,
          satisfaction: 6,
          resolved: true,
          matched: true,
          returnIntent: true,
        }),
        400,
      );
      const data = await refresh(sessions.student1);
      const foreignUnit = data.courses.find(
        (item) => item.id !== "c-program" && item.units.length,
      ).units[0];
      const slot = await available(sessions.student1, "ta1");
      ok(
        await action(sessions.student1, "book", {
          courseId: "c-program",
          unitId: foreignUnit.id,
          mode: "DETAILED",
          taId: "ta1",
          slotId: slot.id,
        }),
        400,
      );
    },
  );
  await test(
    19,
    "予約の質問変更とキャンセルを TA に通知し空き枠を戻す",
    async () => {
      const original = await getBooking(sessions.student1, fixture.detailed);
      ok(
        await action(sessions.student1, "editBooking", {
          id: fixture.detailed,
          question: "【架空・変更】配列の繰り返しも確認したい。",
        }),
      );
      assert.ok(
        (await refresh(sessions.ta1)).notifications.some(
          (item) =>
            item.bookingId === fixture.detailed &&
            item.message.includes("変更"),
        ),
      );
      ok(await action(sessions.student1, "cancel", { id: fixture.detailed }));
      assert.equal(
        (await getBooking(sessions.student1, fixture.detailed)).status,
        "CANCELLED",
      );
      const taData = await refresh(sessions.ta1);
      assert.ok(
        taData.notifications.some(
          (item) =>
            item.bookingId === fixture.detailed &&
            item.message.includes("キャンセル"),
        ),
      );
      assert.ok(
        taData.tas
          .find((item) => item.id === "ta1")
          .availability.some((item) => item.id === original.slotId),
      );
    },
  );
  await test(20, "教員の履歴権限を管理者が付与・撤回できる", async () => {
    const studentId = sessions.student1.data.viewer.id;
    const userId = sessions.teacher.data.viewer.id;
    ok(
      await action(sessions.admin, "grantHistory", {
        studentId,
        userId,
        revoke: true,
      }),
    );
    ok(await request(sessions.teacher, `/api/records/${fixture.record}`), 403);
    ok(await action(sessions.admin, "grantHistory", { studentId, userId }));
    ok(await request(sessions.teacher, `/api/records/${fixture.record}`));
    ok(
      await action(sessions.admin, "grantHistory", {
        studentId,
        userId,
        revoke: true,
      }),
    );
    ok(await request(sessions.teacher, `/api/records/${fixture.record}`), 403);
  });
  await test(
    21,
    "飛び込みを担当未確認の一般相談として受付記録できる",
    async () => {
      const data = await refresh(sessions.admin);
      const now = Date.now();
      const candidate = data.students.find(
        (student) =>
          !data.bookings.some(
            (booking) =>
              booking.studentId === student.id &&
              ["BOOKED", "CHECKED_IN", "IN_PROGRESS"].includes(
                booking.status,
              ) &&
              new Date(booking.start).getTime() < now + 35 * 60_000 &&
              new Date(booking.end).getTime() > now,
          ),
      );
      assert.ok(candidate, "飛び込みテスト用学生に直近35分の空きがない");
      const studentId = candidate.id;
      const response = ok(
        await action(sessions.admin, "walkIn", {
          studentId,
          courseId: "c-database",
          question: "【架空・飛び込みテスト】一般相談で確認する。",
        }),
      );
      const booking = (await refresh(sessions.admin)).bookings.find(
        (item) => item.id === response.bookingId,
      );
      assert.equal(booking.source, "WALK_IN");
      assert.equal(booking.status, "CHECKED_IN");
      assert.equal(booking.taId, null);
      assert.ok(booking.checkedInAt);
      ok(await action(sessions.admin, "cancel", { id: booking.id }));
    },
  );
  await test(
    22,
    "管理者の指標目標と導入前期間を手入力でき初期値へ戻せる",
    async () => {
      const targets = {
        satisfaction: 4.2,
        mismatch: 3,
        success: 90,
        cancellation: 5,
        resolved: 80,
        prepared: 75,
        recorded: 95,
        effectiveMinutes: 30,
      };
      ok(
        await action(sessions.admin, "settings", {
          targets,
          baseline: { users: 8 },
          baselinePeriod: "【テストのみ・架空】導入前 1 週間",
          targetPeriod: "【テストのみ】次学期",
        }),
      );
      const data = await refresh(sessions.admin);
      assert.deepEqual(data.settings.targets, targets);
      assert.equal(data.settings.baseline.users, 8);
      assert.ok(data.settings.baselinePeriod.includes("架空"));
      ok(
        await action(sessions.admin, "settings", {
          targets: {},
          baseline: {},
          baselinePeriod: "",
          targetPeriod: "",
        }),
      );
    },
  );
  await test(
    23,
    "ログアウト後は同じ Cookie のセッションを無効化する",
    async () => {
      const session = await login("student4");
      ok(
        await request(session, "/api/auth", {
          method: "POST",
          body: { action: "logout" },
        }),
      );
      ok(await request(session, "/api/data"), 401);
    },
  );
  await test(
    24,
    "偽装 Host と同一偽装 Origin を使ったアクセスを拒否する",
    async () => {
      ok(await rawHostRequest(sessions.admin, "/api/data"), 403);
      ok(
        await rawHostRequest(null, "/api/auth", {
          email: "admin@example.test",
          password: "Demo2026!",
        }),
        403,
      );
    },
  );
} catch (error) {
  results.push({
    id: "SETUP",
    name: "隔離デモ環境とログインの準備",
    status: "FAIL",
    durationMs: 0,
    reason: String(error?.message || error).slice(0, 1200),
  });
  console.error(`セットアップ失敗: ${error?.message || error}`);
} finally {
  const endedAt = new Date().toISOString();
  const passed = results.filter((result) => result.status === "PASS").length;
  const failed = results.length - passed;
  const report = {
    startedAt,
    endedAt,
    timezone: "Asia/Tokyo",
    baseURL: base,
    isolation: `運用用 dev.db と別の SQLite ${databaseLabel}。架空デモデータを実際に変更。DB の隔離はサーバー起動時の DATABASE_URL 設定に依存。`,
    passed,
    failed,
    results,
  };
  mkdirSync(path.join(project, "tests"), { recursive: true });
  mkdirSync(path.join(project, "docs"), { recursive: true });
  const latestPath = path.join(project, "tests", "results.json");
  const historyPath = path.join(project, "tests", "run-history.json");
  const priorRuns = existsSync(historyPath)
    ? JSON.parse(readFileSync(historyPath, "utf8"))
    : existsSync(latestPath)
      ? [JSON.parse(readFileSync(latestPath, "utf8"))]
      : [];
  if (!priorRuns.some((run) => run.startedAt === report.startedAt))
    priorRuns.push(report);
  writeFileSync(historyPath, JSON.stringify(priorRuns, null, 2));
  writeFileSync(latestPath, JSON.stringify(report, null, 2));
  const lines = [
    "# 動作テスト結果",
    "",
    `実行開始: ${startedAt} / 終了: ${endedAt}（UTC。表示・日付判定は Asia/Tokyo）`,
    "",
    `対象: ${base}。隔離した SQLite ${databaseLabel}。結果: **${passed} 件成功、${failed} 件失敗**。`,
    "",
    "実際の API に fetch（Host 偽装のみ raw HTTP）でアクセスし、セッション Cookie・CSRF・Origin を使って予約から指導・回答・分析まで保存して検証した。下表は自動生成した実行結果で、未実行項目を成功として記載していない。",
    "",
    "| 番号 | テスト | 結果 | 時間 ms |",
    "|---|---|---|---|",
    ...results.map(
      (result) =>
        `| ${result.id} | ${result.name.replaceAll("|", "／")} | ${result.status} | ${result.durationMs} |`,
    ),
    "",
    ...results
      .filter((result) => result.status === "FAIL")
      .flatMap((result) => [`失敗 ${result.id}: ${result.reason}`, ""]),
    "補足: 1～15 は要求された 15 項目、16～24 は追加の認証・権限・入力・通知・履歴許可・飛び込み・指標設定・失効・Host 検証。通知の保存は API 検証で、ブラウザーの自動更新・スマートフォン表示は別途 UI 確認を要する。実測データ、大学 SSO、IC 機材、実際の現場運用、長時間負荷・多台数分散環境は未検証。",
    "",
    `コマンド・隔離 DB の起動方法は README に記載。最新の機械可読結果は tests/results.json。失敗・再実行を含む ${priorRuns.length} 回の実行履歴は tests/run-history.json に保持。`,
    "",
  ];
  lines.push(
    "修正・再検証の経緯: [検証中に見つけて修正した事項](test-repairs.md)。",
    "",
  );
  const maintenancePath = path.join(
    project,
    "tests",
    "maintenance-results.json",
  );
  if (existsSync(maintenancePath)) {
    const maintenance = JSON.parse(readFileSync(maintenancePath, "utf8"));
    lines.push(
      `追加の保守検証: [バックアップ・復元の実検証](maintenance-test-results.md)。${maintenance.passed} 成功 / ${maintenance.failed} 失敗。実行時刻と DB は同資料を参照。`,
      "",
    );
  }
  lines.push("ブラウザー実観測: [ブラウザー確認記録](browser-tests.md)。", "");
  writeFileSync(
    path.join(project, "docs", "test-results.md"),
    lines.join("\n"),
  );
  console.log(`実結果保存: ${passed} PASS / ${failed} FAIL`);
  if (failed || results.length !== 24) process.exitCode = 1;
}
