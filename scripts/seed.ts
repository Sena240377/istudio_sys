import { db } from "../src/lib/db";
import { digest, hashPassword } from "../src/lib/auth";
import { ensureSlots, tokyoDay } from "../src/lib/domain";

const demoPassword = "Demo2026!";
const courses = [
  {
    id: "c-basic",
    name: "基礎数学",
    field: "MATHEMATICS",
    units: ["方程式", "関数", "集合"],
  },
  {
    id: "c-calculus",
    name: "微分積分",
    field: "MATHEMATICS",
    units: ["極限", "微分", "積分"],
  },
  {
    id: "c-linear",
    name: "線形代数",
    field: "MATHEMATICS",
    units: ["行列", "ベクトル", "固有値"],
  },
  {
    id: "c-stats",
    name: "統計学",
    field: "STATISTICS",
    units: ["記述統計", "確率分布", "仮説検定"],
  },
  {
    id: "c-program",
    name: "プログラミング基礎",
    field: "COMPUTING",
    units: ["変数と条件分岐", "繰り返し", "関数"],
  },
  {
    id: "c-python",
    name: "Python",
    field: "COMPUTING",
    units: ["リストと辞書", "データ分析", "例外処理"],
  },
  {
    id: "c-java",
    name: "Java",
    field: "COMPUTING",
    units: ["クラス", "継承", "コレクション"],
  },
  {
    id: "c-database",
    name: "データベース",
    field: "COMPUTING",
    units: ["SQL", "正規化", "トランザクション"],
  },
];
const profiles = [
  {
    id: "ta1",
    name: "高橋 はる（架空）",
    subjects: ["c-program", "c-python"],
    expertise: ["COMPUTING"],
    units: ["条件分岐", "繰り返し", "関数", "リスト"],
    present: true,
  },
  {
    id: "ta2",
    name: "佐藤 そう（架空）",
    subjects: ["c-python", "c-database"],
    expertise: ["COMPUTING", "STATISTICS"],
    units: ["SQL", "データ分析", "正規化"],
    present: true,
  },
  {
    id: "ta3",
    name: "鈴木 みお（架空）",
    subjects: ["c-basic", "c-calculus"],
    expertise: ["MATHEMATICS"],
    units: ["方程式", "微分", "積分"],
    present: true,
  },
  {
    id: "ta4",
    name: "田中 りく（架空）",
    subjects: ["c-linear", "c-stats"],
    expertise: ["MATHEMATICS", "STATISTICS"],
    units: ["行列", "ベクトル", "仮説検定"],
    present: false,
  },
  {
    id: "ta5",
    name: "伊藤 ゆい（架空）",
    subjects: ["c-basic", "c-stats"],
    expertise: ["MATHEMATICS", "STATISTICS"],
    units: ["関数", "確率分布"],
    present: true,
  },
];
async function main() {
  if (await db.setting.findUnique({ where: { key: "seedVersion" } })) {
    console.log("デモデータは登録済みです。既存データを保持します。");
    await ensureSlots();
    return;
  }
  if (await db.user.count()) {
    console.log(
      "既存アカウントがあるためデモ初期化をスキップしました。データは変更しません。",
    );
    return;
  }
  const accounts = [
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `student${i + 1}`,
      email: `student${i + 1}@example.test`,
      name: `デモ学生 ${i + 1}（架空）`,
      role: "STUDENT",
    })),
    ...profiles.map((p) => ({
      id: p.id,
      email: `${p.id}@example.test`,
      name: p.name,
      role: "TA",
    })),
    {
      id: "teacher",
      email: "teacher@example.test",
      name: "デモ教員（架空）",
      role: "TEACHER",
    },
    {
      id: "admin",
      email: "admin@example.test",
      name: "デモ管理者（架空）",
      role: "ADMIN",
    },
  ];
  await db.$transaction(
    async (tx) => {
      for (const account of accounts) {
        await tx.user.upsert({
          where: { id: account.id },
          update: {},
          create: { ...account, passwordHash: hashPassword(demoPassword) },
        });
        if (account.role === "STUDENT")
          await tx.studentIdentity.upsert({
            where: { userId: account.id },
            update: {},
            create: {
              userId: account.id,
              studentNumberDigest: digest(`fictional-only-${account.id}`),
            },
          });
      }
      for (const course of courses) {
        await tx.course.upsert({
          where: { id: course.id },
          update: {},
          create: { id: course.id, name: course.name, field: course.field },
        });
        for (let i = 0; i < course.units.length; i++)
          await tx.unit.upsert({
            where: { id: `${course.id}-u${i + 1}` },
            update: {},
            create: {
              id: `${course.id}-u${i + 1}`,
              courseId: course.id,
              name: course.units[i],
            },
          });
      }
      for (const p of profiles)
        await tx.taProfile.upsert({
          where: { userId: p.id },
          update: {},
          create: {
            userId: p.id,
            subjects: JSON.stringify(p.subjects),
            expertise: JSON.stringify(p.expertise),
            units: JSON.stringify(p.units),
            present: p.present,
          },
        });
    },
    { timeout: 30_000 },
  );
  await ensureSlots();
  await db.$transaction(
    async (tx) => {
      const today = new Date(`${tokyoDay()}T00:00:00+09:00`);
      for (let i = 0; i < 24; i++) {
        const ta = profiles[i % profiles.length];
        const courseId = ta.subjects[i % 2];
        const studentId = `student${(i % 5) + 1}`;
        const start = new Date(
          today.getTime() -
            (12 - Math.floor(i / 2)) * 86_400_000 +
            (i % 2 ? 815 : 575) * 60_000,
        );
        const end = new Date(start.getTime() + 35 * 60_000);
        const status =
          i % 9 === 7 ? "CANCELLED" : i % 9 === 8 ? "NO_SHOW" : "COMPLETED";
        const booking = await tx.booking.upsert({
          where: { id: `demo-history-${i}` },
          update: {},
          create: {
            id: `demo-history-${i}`,
            studentId,
            taId: ta.id,
            courseId,
            unitId: `${courseId}-u1`,
            question: "【架空データ】授業の演習問題の考え方を確認したいです。",
            start,
            end,
            status,
            matchLevel: 1,
            confirmation: "CONFIRMED",
            mode: i % 2 ? "DETAILED" : "SIMPLE",
            source: i % 6 === 0 ? "WALK_IN" : "RESERVATION",
            dataKind: "DEMO",
            preparation: status === "COMPLETED" ? i % 4 !== 0 : null,
            checkedInAt: status === "COMPLETED" ? start : null,
            startedAt: status === "COMPLETED" ? start : null,
            completedAt: status === "COMPLETED" ? end : null,
            createdAt: new Date(
              start.getTime() - (i % 3 === 0 ? 60 : 1440) * 60_000,
            ),
          },
        });
        await tx.bookingAttempt.create({
          data: {
            studentId,
            success: true,
            dataKind: "DEMO",
            createdAt: booking.createdAt,
          },
        });
        if (status === "COMPLETED" && i % 7 !== 0) {
          await tx.learningRecord.upsert({
            where: { bookingId: booking.id },
            update: {},
            create: {
              bookingId: booking.id,
              studentId,
              taId: ta.id,
              taught:
                "【架空の指導記録】例題を一緒に解き、基本的な手順を整理しました。",
              understood: "基本概念と問題の最初の手順",
              unresolved: i % 3 === 0 ? "応用問題は次回確認" : "",
              handoff: "次回は本人の説明を確認しながら復習する。",
              effectiveMinutes: 20 + (i % 15),
              dataKind: "DEMO",
              createdAt: end,
            },
          });
        }
        if (status === "COMPLETED" && i % 2 === 0)
          await tx.survey.upsert({
            where: { bookingId: booking.id },
            update: {},
            create: {
              bookingId: booking.id,
              studentId,
              satisfaction: 3 + (i % 3),
              resolved: i % 4 !== 0,
              matched: i % 6 !== 0,
              returnIntent: true,
              comment:
                "【架空のアンケート回答】動作検証用です。実際の学生の声ではありません。",
              dataKind: "DEMO",
              createdAt: end,
            },
          });
      }
      for (let i = 0; i < 3; i++)
        await tx.bookingAttempt.create({
          data: {
            studentId: `student${i + 1}`,
            success: false,
            dataKind: "DEMO",
            createdAt: new Date(today.getTime() - 3 * 86_400_000),
          },
        });
      const futureSlots = await tx.slot.findMany({
        where: {
          taId: "ta1",
          start: { gt: new Date(Date.now() + 10 * 60_000) },
          bookingId: null,
        },
        orderBy: { start: "asc" },
        take: 1,
      });
      if (futureSlots[0]) {
        const slot = futureSlots[0];
        const b = await tx.booking.create({
          data: {
            id: "demo-upcoming-1",
            studentId: "student2",
            taId: "ta1",
            courseId: "c-program",
            question: "【架空】繰り返し処理を事前に確認したいです。",
            start: slot.start,
            end: slot.end,
            slotId: slot.id,
            matchLevel: 1,
            confirmation: "CONFIRMED",
            mode: "DETAILED",
            dataKind: "DEMO",
          },
        });
        await tx.slot.update({
          where: { id: slot.id },
          data: { bookingId: b.id },
        });
        await tx.notification.create({
          data: {
            userId: "ta1",
            bookingId: b.id,
            message:
              "【架空・デモ通知】当日の予約情報を事前に確認してください。",
          },
        });
        await tx.bookingAttempt.create({
          data: { studentId: "student2", success: true, dataKind: "DEMO" },
        });
      }
      // No fabricated interview quotes, baseline observations, or targets are seeded.
      await tx.setting.create({
        data: { key: "seedVersion", value: JSON.stringify("1") },
      });
      await tx.setting.create({
        data: { key: "dataKind", value: JSON.stringify("DEMO") },
      });
      await tx.auditEvent.create({
        data: {
          actorId: "admin",
          action: "DEMO_SEED",
          detail:
            "すべて架空の検証用データ。ヒアリング・導入前実測値・改善目標は未登録。",
        },
      });
    },
    { timeout: 30_000 },
  );
  console.log(
    "架空データを登録しました：学生5名・TA5名・教員1名・管理者1名。パスワード Demo2026!（デモ専用）",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
