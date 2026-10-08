import { NextRequest, NextResponse } from "next/server";
import {
  ApiError,
  errorResponse,
  requireRole,
  requireSession,
} from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Spreadsheet formula injection protection; quotes/newlines preserve original wording.
function cell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
function csv(rows: unknown[][], name: string) {
  return new NextResponse(
    "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n"),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}.csv"`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
function date(value: string | null, end: boolean) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ApiError(400, "集計期間の形式が不正です。");
  const parsed = new Date(
    `${value}T${end ? "23:59:59.999" : "00:00:00.000"}+09:00`,
  );
  if (
    Number.isNaN(parsed.getTime()) ||
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
      parsed,
    ) !== value
  )
    throw new ApiError(400, "集計期間が不正です。");
  return parsed;
}
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireSession(req);
    requireRole(user.role, ["ADMIN"]);
    const kind = req.nextUrl.searchParams.get("kind") ?? "metrics";
    const dataKind = req.nextUrl.searchParams.get("dataKind") ?? "DEMO";
    if (
      !["DEMO", "REAL"].includes(dataKind) ||
      !["metrics", "interviews"].includes(kind)
    )
      throw new ApiError(400, "出力区分が不正です。");
    const from = date(req.nextUrl.searchParams.get("from"), false);
    const to = date(req.nextUrl.searchParams.get("to"), true);
    if (from && to && from > to)
      throw new ApiError(400, "開始日は終了日以前を指定してください。");
    const range = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
    const label = dataKind === "DEMO" ? "架空デモデータ" : "実測データ";
    await db.auditEvent.create({
      data: {
        actorId: user.id,
        action: "EXPORT",
        detail: JSON.stringify({ kind, dataKind, from, to }),
      },
    });
    if (kind === "interviews") {
      const entries = await db.interview.findMany({
        where: { dataKind, date: range },
        orderBy: { date: "asc" },
      });
      // Unconsented quotations are omitted from presentation exports.
      const permitted = entries.filter((x) => x.quotePermission === "ALLOWED");
      return csv(
        [
          [
            "データ区分",
            "実施日",
            "対象区分",
            "質問",
            "回答原文（引用許可あり）",
            "現在の運営",
            "採用理由",
            "課題",
            "改善案",
            "引用許可",
            "検証状況",
          ],
          ...permitted.map((x) => [
            label,
            x.date.toISOString().slice(0, 10),
            x.category,
            x.question,
            x.answer,
            x.operation,
            x.reason,
            x.issue,
            x.proposal,
            x.quotePermission,
            x.verification,
          ]),
        ],
        "istudio-consented-interviews",
      );
    }
    const bookings = await db.booking.findMany({
      where: { dataKind, start: range },
      include: { survey: true, record: true },
    });
    const attempts = await db.bookingAttempt.findMany({
      where: { dataKind, createdAt: range },
    });
    const reservations = bookings.filter((x) => x.source === "RESERVATION");
    const attended = bookings.filter(
      (x) =>
        x.checkedInAt ||
        ["CHECKED_IN", "IN_PROGRESS", "COMPLETED"].includes(x.status),
    );
    const completed = bookings.filter((x) => x.status === "COMPLETED");
    const responses = completed.flatMap((x) => (x.survey ? [x.survey] : []));
    const prepared = completed.filter((x) => x.preparation !== null);
    const rate = (n: number, d: number) =>
      d ? Math.round((n / d) * 10000) / 100 : "未取得";
    const numerator = attempts.filter((x) => x.success).length;
    const count = (n: number) =>
      dataKind === "REAL" && !bookings.length && !attempts.length
        ? "未取得"
        : n;
    const format = (d: Date | undefined) => d?.toISOString() ?? "指定なし";
    const common = [label, format(from), format(to)];
    const row = (
      name: string,
      value: unknown,
      n: unknown,
      denominator: unknown,
      definition: string,
    ) => [...common, name, value, n, denominator, definition];
    return csv(
      [
        [
          "データ区分",
          "期間開始",
          "期間終了（日本時間）",
          "指標",
          "値",
          "分子",
          "分母",
          "定義",
        ],
        row(
          "予約総数",
          count(reservations.length),
          count(reservations.length),
          "",
          "期間内に開始する予約。飛び込みを除外",
        ),
        row(
          "予約受付成立率 (%)",
          rate(numerator, attempts.length),
          numerator,
          attempts.length,
          "予約APIで受付成功した件数 / 予約試行件数。関連分野の確認待ちを含む。授業開始日の集計と試行日時の集計は異なる",
        ),
        row(
          "対応確認待ち",
          count(
            reservations.filter((x) => x.confirmation === "PENDING").length,
          ),
          "",
          "",
          "成立率と併記する確認待ち件数",
        ),
        row(
          "キャンセル率 (%)",
          rate(
            reservations.filter((x) => x.status === "CANCELLED").length,
            reservations.length,
          ),
          reservations.filter((x) => x.status === "CANCELLED").length,
          reservations.length,
          "キャンセル予約 / 予約総数",
        ),
        row(
          "無断欠席率 (%)",
          rate(
            reservations.filter((x) => x.status === "NO_SHOW").length,
            reservations.length,
          ),
          reservations.filter((x) => x.status === "NO_SHOW").length,
          reservations.length,
          "無断欠席予約 / 予約総数",
        ),
        row(
          "利用者数",
          count(new Set(attended.map((x) => x.studentId)).size),
          "",
          "",
          "来室記録がある学生の重複なし人数",
        ),
        row(
          "来室件数",
          count(attended.length),
          count(attended.length),
          "",
          "チェックインまたは指導開始・完了した利用件数",
        ),
        row(
          "飛び込み利用数",
          count(bookings.filter((x) => x.source === "WALK_IN").length),
          "",
          "",
          "受付済み飛び込み件数",
        ),
        row(
          "学生満足度 (1–5)",
          responses.length
            ? Math.round(
                (responses.reduce((s, x) => s + x.satisfaction, 0) /
                  responses.length) *
                  100,
              ) / 100
            : "未取得",
          "",
          responses.length,
          "指導完了後の任意回答の平均。回答者に偏りがありうる",
        ),
        row(
          "解決率 (%)",
          rate(responses.filter((x) => x.resolved).length, responses.length),
          responses.filter((x) => x.resolved).length,
          responses.length,
          "解決と回答 / 回答数",
        ),
        row(
          "ミスマッチ率 (%)",
          rate(responses.filter((x) => !x.matched).length, responses.length),
          responses.filter((x) => !x.matched).length,
          responses.length,
          "対応できていなかったと回答 / 回答数",
        ),
        row(
          "事前準備率 (%)",
          rate(prepared.filter((x) => x.preparation).length, prepared.length),
          prepared.filter((x) => x.preparation).length,
          prepared.length,
          "準備済み / 準備状況入力済みの完了指導",
        ),
        row(
          "準備状況記録数",
          prepared.length,
          prepared.length,
          completed.length,
          "未入力を準備不足と断定しない",
        ),
        row(
          "カルテ記録率 (%)",
          rate(completed.filter((x) => x.record).length, completed.length),
          completed.filter((x) => x.record).length,
          completed.length,
          "カルテあり / 指導完了数",
        ),
        row(
          "有効指導時間平均 (分)",
          completed.some((x) => x.record)
            ? Math.round(
                (completed.reduce(
                  (s, x) => s + (x.record?.effectiveMinutes ?? 0),
                  0,
                ) /
                  completed.filter((x) => x.record).length) *
                  100,
              ) / 100
            : "未取得",
          "",
          completed.filter((x) => x.record).length,
          "TAが自己記録した有効時間。35分以内",
        ),
        row(
          "アンケート回答率 (%)",
          rate(responses.length, completed.length),
          responses.length,
          completed.length,
          "任意回答数 / 指導完了数",
        ),
        row(
          "改善効果の解釈",
          "断定不可",
          "",
          "",
          "導入前データ・期間・対象集団・任意回答の偏りを確認して評価",
        ),
      ],
      "istudio-metrics",
    );
  } catch (error) {
    return errorResponse(error);
  }
}
