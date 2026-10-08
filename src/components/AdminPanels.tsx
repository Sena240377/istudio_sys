"use client";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import {
  BarChart3,
  BookOpen,
  Check,
  ClipboardList,
  Download,
  FilePenLine,
  Goal,
  Plus,
  Settings2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import {
  Action,
  AppData,
  Course,
  Interview,
  Ta,
  dateKey,
  roles,
  activeStatuses,
  fieldLabel,
} from "./types";
import { Badge, Empty, Modal } from "./ui";
const metricLabels: Record<string, string> = {
  satisfaction: "学生満足度",
  mismatch: "ミスマッチ発生率",
  success: "予約受付成立率",
  cancellation: "キャンセル率",
  users: "利用者数",
  resolved: "相談内容の解決率",
  prepared: "事前準備実施率",
  recorded: "指導履歴の記録率",
  effectiveMinutes: "指導時間の有効活用",
};
function formatMetric(key: string, value?: number | null) {
  return value === undefined || value === null
    ? "未取得"
    : key === "satisfaction"
      ? `${value.toFixed(1)} / 5`
      : key === "users"
        ? `${value} 人`
        : key === "effectiveMinutes"
          ? `${value.toFixed(1)} 分`
          : `${value.toFixed(1)} %`;
}
function pct(n: number, d: number) {
  return d ? (100 * n) / d : null;
}
function ChartCard({
  title,
  subtitle,
  items,
  line = false,
}: {
  title: string;
  subtitle: string;
  items: { name: string; value: number }[];
  line?: boolean;
}) {
  return (
    <section className="panel chart-panel">
      <h3>{title}</h3>
      <p>{subtitle}</p>
      {items.length && items.some((d) => d.value > 0) ? (
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            {line ? (
              <LineChart
                data={items}
                margin={{ top: 10, right: 12, left: -20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#edf1ef"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value) => [`${value} 件 / 人`, "件数"]}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e5ece8",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#178477"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#178477" }}
                />
              </LineChart>
            ) : (
              <BarChart
                data={items}
                margin={{ top: 10, right: 12, left: -20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#edf1ef"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value) => [`${value} 件 / 人`, "件数"]}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e5ece8",
                  }}
                />
                <Bar
                  dataKey="value"
                  fill="#51a598"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      ) : (
        <Empty
          title="集計対象のデータはありません"
          text="実測値がない場合、数値は作成しません。"
        />
      )}
    </section>
  );
}

export function AnalyticsPanel({ data }: { data: AppData }) {
  const today = dateKey(new Date().toISOString());
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [kind, setKind] = useState("DEMO");
  const inPeriod = (d: string) => !!d && dateKey(d) >= from && dateKey(d) <= to;
  const computed = useMemo(() => {
    const bookings = data.bookings.filter(
      (b) => b.dataKind === kind && inPeriod(b.start),
    );
    const visits = bookings.filter((b) => b.checkedInAt);
    const completed = bookings.filter((b) => b.status === "COMPLETED");
    const reservations = bookings.filter((b) => b.source !== "WALK_IN");
    const preparationReported = completed.filter((b) => b.preparation !== null);
    const ids = new Set(completed.map((b) => b.id));
    const surveys = data.surveys.filter(
      (s) => s.dataKind === kind && ids.has(s.bookingId),
    );
    const records = data.records.filter(
      (r) => r.dataKind === kind && ids.has(r.bookingId),
    );
    const attempts = (data.bookingAttempts || []).filter(
      (a) => a.dataKind === kind && inPeriod(a.createdAt),
    );
    const group = (
      rows: typeof bookings,
      fn: (b: (typeof bookings)[number]) => string,
      unique = false,
    ) => {
      const result = new Map<string, Set<string> | number>();
      for (const b of rows) {
        const k = fn(b);
        if (unique) {
          const set = (result.get(k) as Set<string>) || new Set<string>();
          set.add(b.studentId);
          result.set(k, set);
        } else result.set(k, ((result.get(k) as number) || 0) + 1);
      }
      return [...result]
        .sort(([a], [b]) => a.localeCompare(b, "ja"))
        .map(([name, v]) => ({ name, value: v instanceof Set ? v.size : v }));
    };
    const unique = new Set(visits.map((b) => b.studentId)).size;
    const firstVisits = new Map<string, string>();
    for (const b of data.bookings
      .filter((b) => b.dataKind === kind && b.checkedInAt)
      .sort((a, b) => a.start.localeCompare(b.start))) {
      if (!firstVisits.has(b.studentId)) firstVisits.set(b.studentId, b.start);
    }
    const newUsers = [...new Set(visits.map((b) => b.studentId))].filter((id) =>
      inPeriod(firstVisits.get(id) || ""),
    ).length;
    const metrics: Record<string, number | null> = {
      satisfaction: surveys.length
        ? surveys.reduce((s, a) => s + a.satisfaction, 0) / surveys.length
        : null,
      mismatch: pct(surveys.filter((s) => !s.matched).length, surveys.length),
      success: pct(attempts.filter((a) => a.success).length, attempts.length),
      cancellation: pct(
        reservations.filter((b) => b.status === "CANCELLED").length,
        reservations.length,
      ),
      users: unique,
      resolved: pct(surveys.filter((s) => s.resolved).length, surveys.length),
      prepared: pct(
        preparationReported.filter((b) => b.preparation === true).length,
        preparationReported.length,
      ),
      recorded: pct(
        completed.filter((b) => records.some((r) => r.bookingId === b.id))
          .length,
        completed.length,
      ),
      effectiveMinutes: records.length
        ? records.reduce((s, r) => s + r.effectiveMinutes, 0) / records.length
        : null,
    };
    if (kind === "REAL" && !bookings.length && !attempts.length)
      metrics.users = null;
    const weekDays = ["月", "火", "水", "木", "金", "土", "日"];
    const weekday = group(
      visits,
      (b) =>
        new Intl.DateTimeFormat("ja-JP", {
          timeZone: "Asia/Tokyo",
          weekday: "short",
        }).format(new Date(b.start)),
      true,
    );
    return {
      hasData: kind === "DEMO" || bookings.length > 0 || attempts.length > 0,
      bookings,
      reservations,
      preparationReported,
      visits,
      completed,
      surveys,
      records,
      metrics,
      newUsers,
      repeatUsers: unique - newUsers,
      daily: group(visits, (b) => dateKey(b.start).slice(5), true),
      weekday: weekDays.map((name) => ({
        name,
        value: weekday.find((w) => w.name === name)?.value || 0,
      })),
      hours: group(
        visits,
        (b) =>
          new Intl.DateTimeFormat("ja-JP", {
            timeZone: "Asia/Tokyo",
            hour: "2-digit",
            hour12: false,
          })
            .formatToParts(new Date(b.start))
            .find((p) => p.type === "hour")?.value + "時",
        true,
      ),
      monthly: group(visits, (b) => dateKey(b.start).slice(0, 7), true),
      subjects: group(bookings, (b) => b.courseName),
      tas: data.tas.map((t) => ({
        name: t.name.replace("（架空）", ""),
        value: bookings.filter(
          (b) => b.taId === t.id && b.status !== "CANCELLED",
        ).length,
      })),
    };
  }, [data, from, to, kind]);
  const period = `${from} 〜 ${to}（日本時間）`;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">EVIDENCE FOR BETTER SUPPORT</span>
          <h1>利用・指導品質の分析</h1>
          <p>予約の取りやすさと指導の質を、複数の指標で確かめます。</p>
        </div>
        <a
          className="button secondary"
          href={`/api/export?kind=metrics&dataKind=${kind}&from=${from}&to=${to}`}
        >
          <Download size={16} />
          CSV出力
        </a>
      </div>
      <section className="panel analytics-filter">
        <label>
          集計開始
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          集計終了
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          データ区分
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="DEMO">架空のデモデータ</option>
            <option value="REAL">実測データ</option>
          </select>
        </label>
        <Badge tone={kind === "DEMO" ? "amber" : "teal"}>
          {kind === "DEMO" ? "DEMO / 実績ではありません" : "REAL / 実測のみ"}
        </Badge>
      </section>
      <p className="period-note">
        集計期間：{period} · 来室人数は学生の内部IDで重複を除きます。
      </p>
      <div className="metric-grid">
        {["users", "satisfaction", "success", "mismatch"].map((k) => (
          <section className="panel metric-card" key={k}>
            <p>{metricLabels[k]}</p>
            <strong>{formatMetric(k, computed.metrics[k])}</strong>
            <span>
              {!computed.hasData
                ? "実測データ 未取得"
                : k === "users"
                  ? `新規 ${computed.newUsers} 人 / リピート ${computed.repeatUsers} 人`
                  : k === "success"
                    ? "受付成功 / 記録された予約申込"
                    : `任意アンケート ${computed.surveys.length} 件`}
            </span>
          </section>
        ))}
      </div>
      <div className="analytics-charts">
        <ChartCard
          title="日別の利用者数"
          subtitle={period}
          items={computed.daily}
          line
        />
        <ChartCard
          title="曜日別の利用者数"
          subtitle={period}
          items={computed.weekday}
        />
        <ChartCard
          title="時間帯別の利用者数"
          subtitle={`${period} · 相談開始時刻`}
          items={computed.hours}
        />
        <ChartCard
          title="月別の利用者数"
          subtitle={period}
          items={computed.monthly}
        />
        <ChartCard
          title="満足度の回答分布"
          subtitle={period}
          items={[1, 2, 3, 4, 5].map((n) => ({
            name: n + "点",
            value: computed.surveys.filter((s) => s.satisfaction === n).length,
          }))}
        />
        <ChartCard
          title="相談の解決状況"
          subtitle={period + " · 任意アンケート"}
          items={[
            {
              name: "解決した",
              value: computed.surveys.filter((s) => s.resolved).length,
            },
            {
              name: "未解決",
              value: computed.surveys.filter((s) => !s.resolved).length,
            },
          ]}
        />
        <ChartCard
          title="科目別の相談件数"
          subtitle={`${period} · 予約申込ベース`}
          items={computed.subjects}
        />
        <ChartCard
          title="TA別の担当予約数"
          subtitle={`${period} · 稼働確認用 / 能力順位ではありません`}
          items={computed.tas}
        />
      </div>
      <section className="panel table-panel">
        <div className="section-heading">
          <h2>
            <BarChart3 size={19} />
            予約と指導品質
          </h2>
          <Badge>{kind === "DEMO" ? "架空データ" : "実測データ"}</Badge>
        </div>
        <div className="compact-metrics">
          {[
            [
              "対応確認待ち",
              computed.bookings.filter(
                (b) =>
                  activeStatuses.includes(b.status) &&
                  b.confirmation === "PENDING",
              ).length + " 件",
            ],
            [
              "任意アンケート回答率",
              formatMetric(
                "mismatch",
                pct(computed.surveys.length, computed.completed.length),
              ),
            ],
            ["総予約数", `${computed.reservations.length} 件`],
            [
              "キャンセル率",
              formatMetric("cancellation", computed.metrics.cancellation),
            ],
            [
              "無断欠席率",
              formatMetric(
                "mismatch",
                pct(
                  computed.reservations.filter((b) => b.status === "NO_SHOW")
                    .length,
                  computed.reservations.length,
                ),
              ),
            ],
            [
              "当日予約数",
              `${computed.bookings.filter((b) => dateKey(b.start) === dateKey(b.createdAt)).length} 件`,
            ],
            [
              "飛び込み利用数",
              `${computed.bookings.filter((b) => b.source === "WALK_IN").length} 件`,
            ],
            [
              "相談の解決率",
              formatMetric("resolved", computed.metrics.resolved),
            ],
            [
              "事前準備実施率",
              formatMetric("prepared", computed.metrics.prepared),
            ],
            [
              "履歴の記録率",
              formatMetric("recorded", computed.metrics.recorded),
            ],
            [
              "有効な指導時間",
              formatMetric(
                "effectiveMinutes",
                computed.metrics.effectiveMinutes,
              ),
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{computed.hasData ? value : "未取得"}</strong>
            </div>
          ))}
        </div>
        <p className="help">
          予約受付成立率は受付成功を申込回数で割った値で、対応確認待ちも受付成功に含みます。品質指標は任意回答・指導完了記録を分母として計算します。事前準備の状況が記録された指導完了は
          {computed.preparationReported.length}件 / 指導完了
          {computed.completed.length}
          件です。回答の偏りがあるため、結果だけで改善効果は断定できません。
        </p>
      </section>
      <section className="panel table-panel">
        <div className="section-heading">
          <div>
            <h2>
              <Goal size={19} />
              導入前・導入後の比較
            </h2>
            <p>
              導入前の実測値と目標値は、管理者が取得・設定したときだけ表示します。導入前期間：
              {data.settings.baselinePeriod || "未取得"} / 目標対象期間：
              {data.settings.targetPeriod || "未設定"}。
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>評価指標</th>
                <th>導入前（実測）</th>
                <th>
                  現在の集計値 {kind === "DEMO" ? "（デモ）" : "（実測）"}
                </th>
                <th>管理者設定の目標</th>
              </tr>
            </thead>
            <tbody>
              {[
                "satisfaction",
                "mismatch",
                "success",
                "cancellation",
                "users",
                "resolved",
                "prepared",
                "effectiveMinutes",
              ].map((k) => (
                <tr key={k}>
                  <td>{metricLabels[k]}</td>
                  <td>{formatMetric(k, data.settings.baseline[k])}</td>
                  <td>{formatMetric(k, computed.metrics[k])}</td>
                  <td>
                    {data.settings.targets[k] === undefined
                      ? "未設定"
                      : formatMetric(k, data.settings.targets[k])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="info-box">
          既存システムの仕様・導入前の数値は要ヒアリングです。デモデータとの比較は、実際の改善効果の根拠にはなりません。
        </div>
      </section>
    </>
  );
}

export function ResearchPanel({
  data,
  action,
}: {
  data: AppData;
  action: Action;
}) {
  const blank = {
    date: dateKey(new Date().toISOString()),
    category: "STUDENT",
    question: "",
    answer: "",
    operation: "",
    reason: "",
    issue: "",
    proposal: "",
    quotePermission: "PENDING",
    verification: "UNVERIFIED",
  };
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const verification: Record<string, string> = {
    UNVERIFIED: "未検証",
    INTERVIEW: "ヒアリングで確認",
    DATA: "データで確認",
  };
  const consent: Record<string, string> = {
    PENDING: "未確認",
    ALLOWED: "引用許可あり",
    DENIED: "引用不可",
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LISTEN, VERIFY, IMPROVE</span>
          <h1>ヒアリング・課題の検証</h1>
          <p>現場の工夫と、その運営方法が採用された理由を記録します。</p>
        </div>
        <div className="button-row">
          <a
            className="button secondary"
            href="/api/export?kind=interviews&dataKind=DEMO"
          >
            <Download size={16} />
            引用許可分を出力
          </a>
          <button className="button primary" onClick={() => setOpen(true)}>
            <Plus size={16} />
            調査記録を追加
          </button>
        </div>
      </div>
      <div className="info-box">
        発言は原文で保存します。推測は「未検証」として扱い、確認できた根拠を区別してください。実際の利用者の声は登録されていません。
      </div>
      {data.interviews.length ? (
        <div className="interview-list">
          {data.interviews.map((i) => (
            <article key={i.id} className="panel interview-card">
              <div className="section-heading">
                <p>
                  {i.date} ·{" "}
                  {roles[i.category as keyof typeof roles] || i.category}
                </p>
                <div className="tags">
                  <Badge
                    tone={i.verification === "UNVERIFIED" ? "amber" : "teal"}
                  >
                    {verification[i.verification] || i.verification}
                  </Badge>
                  <Badge
                    tone={i.quotePermission === "ALLOWED" ? "green" : "neutral"}
                  >
                    {consent[i.quotePermission] || i.quotePermission}
                  </Badge>
                  <Badge>
                    {i.dataKind === "REAL" ? "実測調査" : "検証用の記録"}
                  </Badge>
                </div>
              </div>
              <h2>{i.question}</h2>
              <div className="raw-quote">
                <span>回答原文</span>
                <p>{i.answer}</p>
              </div>
              <div className="record-details">
                {[
                  ["現在の運営方法", i.operation],
                  ["採用されている理由", i.reason],
                  ["発見した課題", i.issue],
                  ["改善案", i.proposal],
                ].map(([label, value]) => (
                  <div key={label}>
                    <h3>{label}</h3>
                    <p>{value || "未記録 / 要ヒアリング"}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="調査記録はまだありません"
          text="架空の発言を利用者の声として作成していません。実施したヒアリングを原文で記録してください。"
        >
          <button className="button primary" onClick={() => setOpen(true)}>
            <Plus size={16} />
            最初の調査記録
          </button>
        </Empty>
      )}
      {open && (
        <Modal title="ヒアリングを記録" close={() => setOpen(false)} wide>
          <form
            className="booking-body form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              const ok = await action("saveInterview", form);
              setSaving(false);
              if (ok) {
                setOpen(false);
                setForm(blank);
              }
            }}
          >
            <div className="form-row">
              <label>
                実施日
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </label>
              <label>
                対象者の区分
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                >
                  <option value="STUDENT">学生</option>
                  <option value="TA">TA</option>
                  <option value="TEACHER">教員</option>
                </select>
              </label>
            </div>
            {[
              ["question", "質問内容"],
              ["answer", "回答内容（原文のまま）"],
              ["operation", "現在の運営方法"],
              ["reason", "その運営方法が採用されている理由"],
              ["issue", "発見した課題"],
              ["proposal", "改善案"],
            ].map(([k, label]) => (
              <label key={k}>
                {label}
                {["question", "answer"].includes(k) && (
                  <span className="required">必須</span>
                )}
                <textarea
                  required={["question", "answer"].includes(k)}
                  rows={k === "answer" ? 5 : 2}
                  maxLength={5000}
                  value={form[k as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </label>
            ))}
            <div className="form-row">
              <label>
                発言の引用許可
                <select
                  value={form.quotePermission}
                  onChange={(e) =>
                    setForm({ ...form, quotePermission: e.target.value })
                  }
                >
                  <option value="PENDING">未確認</option>
                  <option value="ALLOWED">引用許可あり</option>
                  <option value="DENIED">引用不可</option>
                </select>
              </label>
              <label>
                課題の検証状況
                <select
                  value={form.verification}
                  onChange={(e) =>
                    setForm({ ...form, verification: e.target.value })
                  }
                >
                  <option value="UNVERIFIED">未検証</option>
                  <option value="INTERVIEW">ヒアリングで確認</option>
                  <option value="DATA">データで確認</option>
                </select>
              </label>
            </div>
            <p className="help">
              この検証用プロトタイプへの記録はデモとして保存されます。実在する個人の情報は入力しないでください。
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setOpen(false)}
              >
                閉じる
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={saving}
              >
                <Check size={16} />
                {saving ? "保存中…" : "記録を保存する"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function SettingsPanel({
  data,
  action,
}: {
  data: AppData;
  action: Action;
}) {
  const admin = data.viewer.role === "ADMIN";
  const [tab, setTab] = useState("courses");
  const [editor, setEditor] = useState<{
    type: string;
    course?: Course;
    ta?: Ta;
  } | null>(null);
  const [name, setName] = useState("");
  const [field, setField] = useState("");
  const [units, setUnits] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [expertise, setExpertise] = useState("");
  const [present, setPresent] = useState(false);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const [metricsLoaded, setMetricsLoaded] = useState(false);
  const [baselinePeriod, setBaselinePeriod] = useState(
    data.settings.baselinePeriod || "",
  );
  const [targetPeriod, setTargetPeriod] = useState(
    data.settings.targetPeriod || "",
  );
  const [studentId, setStudentId] = useState("");
  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);
  function openCourse(course?: Course) {
    setName(course?.name || "");
    setField(course?.field || "");
    setUnits(course?.units.map((u) => u.name).join("\n") || "");
    setEditor({ type: "course", course });
  }
  function openTa(ta: Ta) {
    setSubjects(ta.subjects);
    setExpertise(ta.expertise.join("、"));
    setUnits(ta.units.join("\n"));
    setPresent(ta.present);
    setEditor({ type: "ta", ta });
  }
  function openMetrics() {
    if (!metricsLoaded) {
      setTargets(
        Object.fromEntries(
          Object.entries(data.settings.targets).map(([k, v]) => [k, String(v)]),
        ),
      );
      setBaseline(
        Object.fromEntries(
          Object.entries(data.settings.baseline).map(([k, v]) => [
            k,
            String(v),
          ]),
        ),
      );
      setMetricsLoaded(true);
    }
    setTab("metrics");
  }
  const tabs = [
    ["courses", "科目・単元"],
    ["tas", "TA情報"],
    ...(admin
      ? [
          ["accounts", "アカウント・閲覧許可"],
          ["metrics", "指標・導入前データ"],
          ["system", "保守・運用"],
        ]
      : []),
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">SERVICE MANAGEMENT</span>
          <h1>{admin ? "設定・運用管理" : "TA情報の管理"}</h1>
          <p>現場の柔軟な運営を支える、科目と対応情報の設定。</p>
        </div>
        <Badge tone="teal">
          <ShieldCheck size={13} />
          権限で保護
        </Badge>
      </div>
      <div className="filter-tabs">
        {tabs
          .filter(([id]) => admin || id === "tas")
          .map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => (id === "metrics" ? openMetrics() : setTab(id))}
            >
              {label}
            </button>
          ))}
      </div>
      {tab === "courses" && admin && (
        <section className="panel table-panel">
          <div className="section-heading">
            <h2>
              <BookOpen size={19} />
              相談科目と単元
            </h2>
            <button
              className="button primary compact"
              onClick={() => openCourse()}
            >
              <Plus size={14} />
              科目を追加
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>科目</th>
                  <th>関連分野</th>
                  <th>単元</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.courses.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                    </td>
                    <td>{fieldLabel(c.field)}</td>
                    <td>{c.units.map((u) => u.name).join("、")}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => openCourse(c)}
                      >
                        <FilePenLine size={15} />
                        編集
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {(tab === "tas" || !admin) && (
        <section className="panel table-panel">
          <div className="section-heading">
            <h2>
              <UsersRound size={19} />
              TAの対応情報
            </h2>
            <span className="help">
              勤務日時・予約枠は初期設定された検証用シフト
            </span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>TA</th>
                  <th>対応可能科目</th>
                  <th>得意分野</th>
                  <th>在室</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.tas.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.name}</strong>
                    </td>
                    <td>
                      {data.courses
                        .filter((c) => t.subjects.includes(c.id))
                        .map((c) => c.name)
                        .join("、")}
                    </td>
                    <td>{t.expertise.map(fieldLabel).join("、")}</td>
                    <td>
                      <Badge tone={t.present ? "green" : "neutral"}>
                        {t.present ? "在室" : "不在"}
                      </Badge>
                    </td>
                    <td>
                      <button className="text-button" onClick={() => openTa(t)}>
                        <FilePenLine size={15} />
                        編集
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "accounts" && admin && (
        <>
          <section className="panel table-panel">
            <div className="section-heading">
              <h2>
                <ShieldCheck size={19} />
                アカウント管理
              </h2>
              <span className="help">学籍番号と学習履歴は内部IDで分離</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>利用者</th>
                    <th>デモメール</th>
                    <th>権限</th>
                    <th>利用状態</th>
                  </tr>
                </thead>
                <tbody>
                  {data.accounts?.map((a) => (
                    <tr key={a.id}>
                      <td>{a.name}</td>
                      <td>{a.email}</td>
                      <td>
                        <select
                          aria-label={`${a.name}の権限`}
                          disabled={a.id === data.viewer.id}
                          value={a.role}
                          onChange={(e) =>
                            action("saveAccount", {
                              id: a.id,
                              active: a.active,
                              role: e.target.value,
                            })
                          }
                        >
                          {Object.entries(roles).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          className={`button compact ${a.active ? "secondary" : "primary"}`}
                          disabled={a.id === data.viewer.id}
                          onClick={() =>
                            action("saveAccount", {
                              id: a.id,
                              active: !a.active,
                              role: a.role,
                            })
                          }
                        >
                          {a.active ? "有効 · 無効化する" : "無効 · 有効化する"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel form-panel">
            <h2>
              <ShieldCheck size={19} />
              必要な学生の履歴に閲覧許可を付与
            </h2>
            <p className="help">
              担当外のカルテを自由に閲覧させず、業務上必要な学生だけを許可します。
            </p>
            <div className="form-row">
              <label>
                学生
                <select
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                >
                  <option value="">選択してください</option>
                  {data.students?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                閲覧者
                <select
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                >
                  <option value="">選択してください</option>
                  {data.accounts
                    ?.filter((a) => ["TA", "TEACHER"].includes(a.role))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}（{roles[a.role]}）
                      </option>
                    ))}
                </select>
              </label>
              <button
                className="button primary align-end"
                disabled={!studentId || !userId}
                onClick={() => action("grantHistory", { studentId, userId })}
              >
                閲覧を許可
              </button>
            </div>
          </section>
        </>
      )}
      {tab === "metrics" && admin && (
        <section className="panel table-panel">
          <h2>
            <Goal size={20} />
            改善効果の評価指標
          </h2>
          <div className="form-row">
            <label>
              導入前の集計期間
              <input
                value={baselinePeriod}
                maxLength={200}
                onChange={(e) => setBaselinePeriod(e.target.value)}
                placeholder="例：2026-04-01 〜 2026-06-30（未取得なら空欄）"
              />
            </label>
            <label>
              目標の対象期間
              <input
                value={targetPeriod}
                maxLength={200}
                onChange={(e) => setTargetPeriod(e.target.value)}
                placeholder="現場と合意した評価対象期間"
              />
            </label>
          </div>
          <p className="help">
            目標値は大学・現場との合意後に設定してください。導入前の実測値がない指標は、空欄にして「未取得」を維持します。
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>指標</th>
                  <th>目標値（任意）</th>
                  <th>導入前の実測値（任意）</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(metricLabels).map(([k, l]) => (
                  <tr key={k}>
                    <td>
                      {l}{" "}
                      <small>
                        {k === "satisfaction"
                          ? "1〜5"
                          : k === "users"
                            ? "人"
                            : k === "effectiveMinutes"
                              ? "0〜35分"
                              : "%"}
                      </small>
                    </td>
                    <td>
                      <input
                        aria-label={`${l}の目標値`}
                        type="number"
                        step="0.1"
                        min={0}
                        max={
                          k === "satisfaction"
                            ? 5
                            : k === "effectiveMinutes"
                              ? 35
                              : k === "users"
                                ? undefined
                                : 100
                        }
                        value={targets[k] ?? ""}
                        placeholder="未設定"
                        onChange={(e) =>
                          setTargets({ ...targets, [k]: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${l}の導入前実測値`}
                        type="number"
                        step="0.1"
                        min={0}
                        max={
                          k === "satisfaction"
                            ? 5
                            : k === "effectiveMinutes"
                              ? 35
                              : k === "users"
                                ? undefined
                                : 100
                        }
                        value={baseline[k] ?? ""}
                        placeholder="未取得"
                        onChange={(e) =>
                          setBaseline({ ...baseline, [k]: e.target.value })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="button primary"
            onClick={() =>
              action("settings", {
                baselinePeriod,
                targetPeriod,
                targets: Object.fromEntries(
                  Object.entries(targets)
                    .filter(([, v]) => v !== "")
                    .map(([k, v]) => [k, Number(v)]),
                ),
                baseline: Object.fromEntries(
                  Object.entries(baseline)
                    .filter(([, v]) => v !== "")
                    .map(([k, v]) => [k, Number(v)]),
                ),
              })
            }
          >
            <Check size={16} />
            指標の設定を保存
          </button>
        </section>
      )}
      {tab === "system" && admin && (
        <div className="two-column">
          <section className="panel form-panel">
            <h2>
              <ShieldCheck size={21} />
              検証用プロトタイプの運用
            </h2>
            <div className="record-details">
              <div>
                <h3>データの扱い</h3>
                <p>
                  すべて架空データです。本番の個人情報の取り扱いには大学側の承認が必要です。
                </p>
              </div>
              <div>
                <h3>既存システムとの関係</h3>
                <p>
                  独立した検証環境です。SimplyBook.meや授業出欠システムの変更・連携は行っていません。
                </p>
              </div>
              <div>
                <h3>通知と競合対策</h3>
                <p>
                  画面は5秒ごとに更新します。予約の重複はサーバーとデータベースで検証します。
                </p>
              </div>
            </div>
          </section>
          <section className="panel form-panel">
            <h2>
              <ClipboardList size={21} />
              保守・引き継ぎ
            </h2>
            <p>
              ソースコードのREADMEと運用資料に、Windows向け起動、バックアップ、復元、既存運用への切り戻し手順を記載しています。
            </p>
            <div className="info-box">
              未確認事項：既存予約の詳細仕様、科目分類の妥当性、勤務シフトの運用、利用者の意見、導入前の実測指標。いずれも要ヒアリングです。
            </div>
          </section>
        </div>
      )}
      {editor && (
        <Modal
          title={
            editor.type === "course" ? "科目・単元を編集" : "TAの対応情報を編集"
          }
          close={() => setEditor(null)}
        >
          <form
            className="booking-body form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              const ok = await action(
                editor.type === "course" ? "saveCourse" : "saveTa",
                editor.type === "course"
                  ? {
                      id: editor.course?.id,
                      name,
                      field,
                      units: units
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }
                  : {
                      id: editor.ta?.id,
                      subjects,
                      expertise: expertise
                        .split(/[、,]/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                      units: units
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                      present,
                    },
              );
              setSaving(false);
              if (ok) setEditor(null);
            }}
          >
            {editor.type === "course" ? (
              <>
                <label>
                  授業名
                  <input
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  関連分野
                  <select
                    required
                    value={field}
                    onChange={(e) => setField(e.target.value)}
                  >
                    <option value="">関連分野を選択</option>
                    {[...new Set(data.courses.map((c) => c.field))].map((f) => (
                      <option key={f} value={f}>
                        {fieldLabel(f)}
                      </option>
                    ))}
                  </select>
                  <span className="help">
                    TAの得意分野とこの名称を照合して、関連分野の相談を提案します。
                  </span>
                </label>
              </>
            ) : (
              <>
                <p className="dialog-context">{editor.ta?.name}</p>
                <label>対応可能科目</label>
                <div className="checkbox-grid">
                  {data.courses.map((c) => (
                    <label className="check-label" key={c.id}>
                      <input
                        type="checkbox"
                        checked={subjects.includes(c.id)}
                        onChange={(e) =>
                          setSubjects(
                            e.target.checked
                              ? [...subjects, c.id]
                              : subjects.filter((id) => id !== c.id),
                          )
                        }
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
                <label>得意分野</label>
                <div className="checkbox-grid">
                  {[...new Set(data.courses.map((c) => c.field))].map((f) => (
                    <label className="check-label" key={f}>
                      <input
                        type="checkbox"
                        checked={expertise.split("、").includes(f)}
                        onChange={(e) => {
                          const values = expertise.split("、").filter(Boolean);
                          setExpertise(
                            (e.target.checked
                              ? [...values, f]
                              : values.filter((v) => v !== f)
                            ).join("、"),
                          );
                        }}
                      />
                      {fieldLabel(f)}
                    </label>
                  ))}
                </div>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={present}
                    onChange={(e) => setPresent(e.target.checked)}
                  />
                  現在在室している
                </label>
              </>
            )}
            <label>
              対応単元（1行に1つ）
              <textarea
                rows={5}
                value={units}
                onChange={(e) => setUnits(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditor(null)}
              >
                閉じる
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={saving}
              >
                {saving ? "保存中…" : "変更を保存"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
