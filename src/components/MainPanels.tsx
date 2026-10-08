"use client";
import { useState } from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  DoorOpen,
  FilePenLine,
  GraduationCap,
  MessageCircle,
  Plus,
  Search,
  Star,
  UsersRound,
} from "lucide-react";
import {
  Action,
  AppData,
  Booking,
  activeStatuses,
  day,
  time,
  isToday,
  roles,
} from "./types";
import { Badge, Empty, Modal, Status, TaCard } from "./ui";

export function Dashboard({
  data,
  action,
  book,
  navigate,
}: {
  data: AppData;
  action: Action;
  book: () => void;
  navigate: (tab: string) => void;
}) {
  const student = data.viewer.role === "STUDENT";
  const today = data.bookings.filter(
    (b) => isToday(b.start) && b.status !== "CANCELLED",
  );
  const upcoming = data.bookings
    .filter((b) => [...activeStatuses, "PENDING"].includes(b.status))
    .sort((a, b) => a.start.localeCompare(b.start));
  const next = upcoming[0];
  const unread = data.notifications.filter((n) => !n.read);
  const present = data.tas.filter((t) => t.present);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR LEARNING SPACE</span>
          <h1>
            {student
              ? "学びを、いっしょに。"
              : `${roles[data.viewer.role]}ダッシュボード`}
          </h1>
          <p>
            {data.viewer.name}さん、こんにちは。
            {student
              ? "小さな疑問も、ここから解決していきましょう。"
              : "今日の相談と、学生の学びを確認しましょう。"}
          </p>
        </div>
        <span className="today-chip">
          <CalendarDays size={17} />
          {day(new Date().toISOString())}
        </span>
      </div>
      <div className="home-grid">
        <section className="hero-card">
          <div className="hero-copy">
            <Badge tone="white">麗澤大学 学習支援施設</Badge>
            <h2>
              {student ? (
                <>
                  「わからない」を、
                  <br />
                  次の一歩に。
                </>
              ) : (
                <>
                  一人ひとりの学びを、
                  <br />
                  次の相談につなぐ。
                </>
              )}
            </h2>
            <p>
              {student
                ? "TAと一緒に考える、35分の学習相談。科目から相談相手を探せます。まだ質問がまとまっていなくても大丈夫。"
                : "相談内容を事前に確認し、これまでの指導を引き継ぎながら、柔軟な学習支援を。"}
            </p>
            <button
              className="button hero-button"
              onClick={student ? book : () => navigate("bookings")}
            >
              {student ? <Plus size={18} /> : <CalendarDays size={18} />}{" "}
              {student ? "学習相談を予約する" : "予約・来室状況を確認"}
              <ArrowRight size={18} />
            </button>
            <span className="hero-caption">
              {student
                ? "簡単予約なら、科目と日時を選ぶだけ"
                : "未確認の予約・通知は、ダッシュボードで確認できます"}
            </span>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-halo" />
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-note note-one">
              <BookOpen size={37} />
              <i />
              <i />
            </div>
            <div className="art-note note-two">
              <MessageCircle size={31} />
              <span>なるほど！</span>
            </div>
            <div className="art-spark">✦</div>
            <div className="art-spark small">✧</div>
          </div>
        </section>
        <section className="next-card">
          <div className="section-heading">
            <h2>{student ? "次の学習相談" : "直近の相談"}</h2>
            <CalendarDays size={18} />
          </div>
          {next ? (
            <>
              <div className="date-feature">
                <strong>
                  {new Intl.DateTimeFormat("ja-JP", {
                    timeZone: "Asia/Tokyo",
                    day: "numeric",
                  })
                    .format(new Date(next.start))
                    .replace("日", "")}
                </strong>
                <div>
                  {new Intl.DateTimeFormat("ja-JP", {
                    timeZone: "Asia/Tokyo",
                    month: "long",
                    weekday: "short",
                  }).format(new Date(next.start))}
                  <b>
                    {time(next.start)} – {time(next.end)}
                  </b>
                </div>
              </div>
              <h3>{next.courseName}</h3>
              <p>{next.taName || "受付・教員が相談先を確認中"}</p>
              <Status booking={next} />
              <button
                className="button secondary full"
                onClick={() => navigate("bookings")}
              >
                予約内容を確認
                <ChevronRight size={16} />
              </button>
            </>
          ) : (
            <Empty
              title="これからの相談はありません"
              text="気になる科目から、相談を始められます。"
            />
          )}
        </section>
      </div>
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon teal">
            <CalendarDays size={20} />
          </span>
          <div>
            <p>{student ? "これからの予約" : "今日の相談"}</p>
            <strong>
              {student ? upcoming.length : today.length}
              <small>件</small>
            </strong>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon blue">
            <BookOpen size={20} />
          </span>
          <div>
            <p>{student ? "これまでの学習記録" : "指導履歴の記録"}</p>
            <strong>
              {data.records.length}
              <small>件</small>
            </strong>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon amber">
            <UsersRound size={20} />
          </span>
          <div>
            <p>現在在室しているTA</p>
            <strong>
              {present.length}
              <small>名</small>
            </strong>
          </div>
          <span className="live-dot">LIVE</span>
        </div>
      </div>
      {!student && (
        <section className="panel notification-panel">
          <div className="section-heading">
            <h2>
              <Bell size={19} />
              予約のお知らせ{" "}
              <Badge tone={unread.length ? "amber" : "neutral"}>
                {unread.length} 件未確認
              </Badge>
            </h2>
            <span className="help">5秒ごとに自動更新</span>
          </div>
          {unread.length ? (
            unread.slice(0, 6).map((n) => (
              <div className="notification-item" key={n.id}>
                <div className="notification-dot" />
                <div>
                  <p>{n.message}</p>
                  <small>
                    {day(n.createdAt)} {time(n.createdAt)}
                  </small>
                </div>
                <button
                  className="button compact secondary"
                  onClick={() => action("readNotification", { id: n.id })}
                >
                  <Check size={14} />
                  確認しました
                </button>
              </div>
            ))
          ) : (
            <div className="small-empty">
              <CheckCircle2 size={18} />
              未確認のお知らせはありません。
            </div>
          )}
        </section>
      )}
      <div className="section-heading spaced">
        <div>
          <h2>相談できるTA</h2>
          <p>得意な科目と空き時間を見て、気軽に相談できます。</p>
        </div>
        <button className="text-button" onClick={() => navigate("search")}>
          すべて見る
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="ta-grid">
        {data.tas.slice(0, 3).map((ta) => (
          <TaCard
            key={ta.id}
            ta={ta}
            courses={data.courses}
            onSelect={student ? book : undefined}
          />
        ))}
      </div>
      <div className="home-footnote">
        <GraduationCap size={24} />
        <div>
          <strong>科目が合うTAが見つからなくても、相談できます。</strong>
          <p>
            関連分野のTAへの事前確認、一般相談、教員への相談も用意しています。TAの能力を順位づけする仕組みはありません。
          </p>
        </div>
      </div>
    </>
  );
}

export function SearchPanel({
  data,
  book,
}: {
  data: AppData;
  book: (course?: string, taId?: string) => void;
}) {
  const [courseId, setCourseId] = useState("");
  const [onlyPresent, setOnlyPresent] = useState(false);
  const course = data.courses.find((c) => c.id === courseId);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">FIND YOUR SUPPORT</span>
          <h1>TA・相談先を探す</h1>
          <p>得意分野は相談の目安です。完全一致だけで利用を制限しません。</p>
        </div>
        {data.viewer.role === "STUDENT" && (
          <button className="button primary" onClick={() => book(courseId)}>
            <Plus size={18} />
            相談を予約
          </button>
        )}
      </div>
      <section className="panel search-toolbar">
        <label>
          <Search size={18} />
          <select
            aria-label="相談する科目"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">すべての科目</option>
            {data.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={onlyPresent}
            onChange={(e) => setOnlyPresent(e.target.checked)}
          />
          現在在室しているTA
        </label>
        <Badge>
          {data.tas.filter((t) => !onlyPresent || t.present).length} 名のTA
        </Badge>
      </section>
      <div className="ta-grid">
        {data.tas
          .filter((t) => !onlyPresent || t.present)
          .map((ta) => (
            <TaCard
              key={ta.id}
              ta={ta}
              courses={data.courses}
              course={course}
              onSelect={
                data.viewer.role === "STUDENT"
                  ? () => book(courseId, ta.id)
                  : undefined
              }
            />
          ))}
      </div>
      {course && (
        <div className="home-footnote">
          <MessageCircle size={24} />
          <div>
            <strong>相談先が決まらないときは、一般相談や教員相談へ。</strong>
            <p>
              対応が未確認のTAには自動で割り当てません。関連分野の場合も、TAが対応できることを確認してから確定します。
            </p>
            {data.viewer.role === "STUDENT" && (
              <button className="text-button" onClick={() => book(courseId)}>
                相談を申し込む
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function BookingsPanel({
  data,
  action,
  book,
}: {
  data: AppData;
  action: Action;
  book: () => void;
}) {
  const [filter, setFilter] = useState("upcoming");
  const [dialog, setDialog] = useState<{ type: string; b: Booking } | null>(
    null,
  );
  const [question, setQuestion] = useState("");
  const [fields, setFields] = useState({
    taught: "",
    understood: "",
    unresolved: "",
    handoff: "",
    effectiveMinutes: 35,
  });
  const [survey, setSurvey] = useState({
    satisfaction: 0,
    resolved: "",
    matched: "",
    returnIntent: "",
    comment: "",
  });
  const [saving, setSaving] = useState(false);
  const [assignTa, setAssignTa] = useState("");
  const student = data.viewer.role === "STUDENT";
  const reception = ["TEACHER", "ADMIN"].includes(data.viewer.role);
  const operational = !student;
  const tutoring = ["TA", "ADMIN"].includes(data.viewer.role);
  const list = data.bookings
    .filter(
      (b) =>
        filter === "all" ||
        (filter === "today" && isToday(b.start)) ||
        (filter === "upcoming" &&
          [...activeStatuses, "PENDING"].includes(b.status)) ||
        (filter === "completed" && b.status === "COMPLETED"),
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  function open(type: string, b: Booking) {
    setDialog({ type, b });
    setQuestion(b.question || "");
    const existing = data.records.find((r) => r.bookingId === b.id);
    setFields(
      existing
        ? {
            taught: existing.taught,
            understood: existing.understood,
            unresolved: existing.unresolved,
            handoff: existing.handoff,
            effectiveMinutes: existing.effectiveMinutes,
          }
        : {
            taught: "",
            understood: "",
            unresolved: "",
            handoff: "",
            effectiveMinutes: 35,
          },
    );
    const savedSurvey = data.surveys.find((s) => s.bookingId === b.id);
    setSurvey(
      savedSurvey
        ? {
            satisfaction: savedSurvey.satisfaction,
            resolved: String(savedSurvey.resolved),
            matched: String(savedSurvey.matched),
            returnIntent: String(savedSurvey.returnIntent),
            comment: savedSurvey.comment || "",
          }
        : {
            satisfaction: 0,
            resolved: "",
            matched: "",
            returnIntent: "",
            comment: "",
          },
    );
  }
  async function save() {
    if (!dialog) return;
    setSaving(true);
    const { b, type } = dialog;
    let ok = await action(
      type === "edit"
        ? "editBooking"
        : type === "record"
          ? "saveRecord"
          : type === "assign"
            ? "assignBooking"
            : "survey",
      type === "edit"
        ? { id: b.id, question }
        : type === "record"
          ? { bookingId: b.id, ...fields }
          : type === "assign"
            ? { id: b.id, taId: assignTa }
            : {
                bookingId: b.id,
                ...survey,
                resolved: survey.resolved === "true",
                matched: survey.matched === "true",
                returnIntent: survey.returnIntent === "true",
              },
    );
    if (ok && type === "record" && b.status === "IN_PROGRESS")
      ok = await action("status", { id: b.id, status: "COMPLETED" });
    setSaving(false);
    if (ok) setDialog(null);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">APPOINTMENTS & RECEPTION</span>
          <h1>{student ? "予約・来室" : "予約・受付管理"}</h1>
          <p>
            {student
              ? "予約内容の確認、チェックイン、指導後のアンケートはこちら。"
              : "対応確認から来室・指導完了まで、相談の進み具合を共有します。"}
          </p>
        </div>
        {student && (
          <button className="button primary" onClick={book}>
            <Plus size={18} />
            新しい予約
          </button>
        )}
      </div>
      <div className="filter-tabs">
        {[
          ["upcoming", "これから"],
          ["today", "今日"],
          ["completed", "指導完了"],
          ["all", "すべて"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? "active" : ""}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
        <span>5秒ごとに自動更新</span>
      </div>
      {list.length ? (
        <div className="booking-list">
          {list.map((b) => (
            <article className="panel booking-card" key={b.id}>
              <div className="booking-card-header">
                <div className="booking-date">
                  <CalendarDays size={18} />
                  <strong>{day(b.start)}</strong>
                  <span>
                    {time(b.start)} – {time(b.end)}
                  </span>
                  {isToday(b.start) && <Badge tone="amber">今日</Badge>}
                </div>
                <Status booking={b} />
              </div>
              <div className="booking-card-content">
                <div>
                  <div className="tags">
                    <span>
                      {b.source === "WALK_IN"
                        ? "飛び込み利用"
                        : b.mode === "DETAILED"
                          ? "詳細予約"
                          : "簡単予約"}
                    </span>
                    <span>架空データ</span>
                  </div>
                  <h3>
                    {b.courseName}
                    {b.unitName && <small> / {b.unitName}</small>}
                  </h3>
                  <p className="booking-people">
                    {operational && (
                      <>
                        <UsersRound size={14} />
                        {b.studentName}　
                      </>
                    )}
                    担当：{b.taName || "受付・教員による調整"}
                  </p>
                  <p className="question-preview">
                    {b.question || "質問内容は相談時に共有します。"}
                  </p>
                  {b.checkedInAt && (
                    <p className="help">
                      <DoorOpen size={13} />
                      来室 {time(b.checkedInAt)}
                    </p>
                  )}
                  {b.matchLevel === 2 && (
                    <p className="help amber-text">
                      関連分野の相談 · 対応確認：
                      {(
                        {
                          PENDING: "確認待ち",
                          CONFIRMED: "対応可能と確認済み",
                          DECLINED: "対応困難",
                        } as Record<string, string>
                      )[b.confirmation] || "未確認"}
                    </p>
                  )}
                </div>
                <div className="booking-actions">
                  {student &&
                    ["BOOKED", "RESERVED", "CONFIRMED"].includes(b.status) && (
                      <button
                        disabled={
                          !isToday(b.start) ||
                          (!!b.taId && b.confirmation !== "CONFIRMED")
                        }
                        title={
                          !isToday(b.start)
                            ? "予約当日にチェックインできます"
                            : "対応確認後にチェックインできます"
                        }
                        className="button primary compact"
                        onClick={() => action("checkIn", { id: b.id })}
                      >
                        <DoorOpen size={15} />
                        チェックイン
                      </button>
                    )}
                  {student &&
                    ["BOOKED", "RESERVED", "CONFIRMED"].includes(b.status) && (
                      <>
                        <button
                          className="button secondary compact"
                          onClick={() => open("edit", b)}
                        >
                          <FilePenLine size={14} />
                          内容を変更
                        </button>
                        <button
                          className="text-button danger"
                          onClick={() => setDialog({ type: "cancel", b })}
                        >
                          予約をキャンセル
                        </button>
                      </>
                    )}
                  {student &&
                    b.status === "COMPLETED" &&
                    !data.surveys.some((s) => s.bookingId === b.id) && (
                      <button
                        className="button primary compact"
                        onClick={() => open("survey", b)}
                      >
                        <Star size={14} />
                        任意アンケート
                      </button>
                    )}
                  {student &&
                    data.surveys.some((s) => s.bookingId === b.id) && (
                      <Badge tone="green">アンケート回答済み</Badge>
                    )}
                  {tutoring &&
                    b.status === "BOOKED" &&
                    b.confirmation === "PENDING" &&
                    !!b.taId && (
                      <>
                        <button
                          className="button primary compact"
                          onClick={() =>
                            action("confirmMatch", { id: b.id, accepted: true })
                          }
                        >
                          <Check size={15} />
                          対応可能・確定
                        </button>
                        <button
                          className="button secondary compact"
                          onClick={() =>
                            action("confirmMatch", {
                              id: b.id,
                              accepted: false,
                            })
                          }
                        >
                          対応不可を通知
                        </button>
                      </>
                    )}
                  {reception &&
                    ["BOOKED", "RESERVED", "CONFIRMED"].includes(b.status) && (
                      <>
                        <button
                          disabled={
                            !isToday(b.start) ||
                            (!!b.taId && b.confirmation !== "CONFIRMED")
                          }
                          className="button secondary compact"
                          onClick={() => action("checkIn", { id: b.id })}
                        >
                          <DoorOpen size={14} />
                          来室受付
                        </button>
                        {tutoring && (
                          <button
                            className="text-button"
                            disabled={
                              new Date(b.end) > new Date() ||
                              (!!b.taId && b.confirmation !== "CONFIRMED")
                            }
                            onClick={() => setDialog({ type: "noShow", b })}
                          >
                            無断欠席を記録
                          </button>
                        )}
                      </>
                    )}
                  {tutoring &&
                    ["BOOKED", "RESERVED", "CONFIRMED", "CHECKED_IN"].includes(
                      b.status,
                    ) && (
                      <button
                        className={`button compact ${b.preparation ? "secondary" : "primary"}`}
                        onClick={() =>
                          action("preparation", {
                            id: b.id,
                            prepared: !b.preparation,
                          })
                        }
                      >
                        <CheckCircle2 size={14} />
                        {b.preparation ? "事前準備済み" : "事前準備を記録"}
                      </button>
                    )}
                  {reception &&
                    !b.taId &&
                    activeStatuses.includes(b.status) && (
                      <button
                        className="button secondary compact"
                        onClick={() => {
                          setAssignTa("");
                          setDialog({ type: "assign", b });
                        }}
                      >
                        <UsersRound size={14} />
                        担当TAを調整
                      </button>
                    )}
                  {tutoring && b.status === "CHECKED_IN" && (
                    <button
                      disabled={!!b.taId && b.confirmation !== "CONFIRMED"}
                      className="button primary compact"
                      onClick={() =>
                        action("status", { id: b.id, status: "IN_PROGRESS" })
                      }
                    >
                      <Clock3 size={14} />
                      指導を開始
                    </button>
                  )}
                  {tutoring &&
                    ["IN_PROGRESS", "COMPLETED"].includes(b.status) && (
                      <button
                        className="button primary compact"
                        onClick={() => open("record", b)}
                      >
                        <BookOpen size={14} />
                        {b.status === "IN_PROGRESS"
                          ? "カルテ記録・指導完了"
                          : "カルテを記録 / 更新"}
                      </button>
                    )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="該当する予約はありません"
          text="新しい予約や受付内容はここに表示されます。"
        />
      )}
      {dialog && (
        <Modal
          title={
            dialog.type === "edit"
              ? "相談内容を変更"
              : dialog.type === "record"
                ? "学習カルテを記録"
                : dialog.type === "survey"
                  ? "今回の相談はいかがでしたか？"
                  : dialog.type === "cancel"
                    ? "予約をキャンセル"
                    : dialog.type === "assign"
                      ? "相談の担当TAを調整"
                      : "無断欠席を記録"
          }
          close={() => setDialog(null)}
        >
          <div className="booking-body">
            <p className="dialog-context">
              {dialog.b.courseName} · {day(dialog.b.start)}{" "}
              {time(dialog.b.start)}
            </p>
            {dialog.type === "assign" && (
              <div className="form-stack">
                <div className="info-box">
                  科目の対応状況と、その時間の空きを確認して担当を選びます。関連分野のTAは、割り当て後に明示的な対応確認が必要です。
                </div>
                <label>
                  担当TA
                  <select
                    value={assignTa}
                    onChange={(e) => setAssignTa(e.target.value)}
                  >
                    <option value="">選択してください</option>
                    {data.tas
                      .filter((t) => {
                        const c = data.courses.find(
                          (c) => c.id === dialog.b.courseId,
                        );
                        return (
                          (t.subjects.includes(dialog.b.courseId) ||
                            t.expertise.includes(c?.field || "")) &&
                          (dialog.b.source === "WALK_IN"
                            ? t.present
                            : t.availability.some(
                                (s) => s.start === dialog.b.start,
                              ))
                        );
                      })
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}（
                          {t.subjects.includes(dialog.b.courseId)
                            ? "対応可能"
                            : "関連分野・要確認"}
                          ）
                        </option>
                      ))}
                  </select>
                </label>
                <p className="help">
                  対応未確認のTAへの自動割り当ては行いません。空きがなければ受付・教員による相談を継続できます。
                </p>
              </div>
            )}
            {dialog.type === "edit" && (
              <label>
                質問内容
                <textarea
                  rows={5}
                  maxLength={2000}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
                <span className="help">変更内容は担当TAに通知します。</span>
              </label>
            )}
            {dialog.type === "record" && (
              <div className="form-stack">
                {[
                  ["taught", "実際に指導した内容"],
                  ["understood", "学生が理解できた部分"],
                  ["unresolved", "解決できなかった問題"],
                  ["handoff", "次回への引き継ぎ"],
                ].map(([k, label]) => (
                  <label key={k}>
                    {label}
                    {k === "taught" && <span className="required">必須</span>}
                    <textarea
                      rows={3}
                      maxLength={3000}
                      value={fields[k as keyof typeof fields]}
                      onChange={(e) =>
                        setFields({ ...fields, [k]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <label>
                  有効に使えた指導時間（分）
                  <input
                    type="number"
                    min={0}
                    max={35}
                    value={fields.effectiveMinutes}
                    onChange={(e) =>
                      setFields({
                        ...fields,
                        effectiveMinutes: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <p className="help">
                  記録内容は、権限がある担当者と学生本人に共有されます。個人情報は必要以上に記録しないでください。
                </p>
              </div>
            )}
            {dialog.type === "survey" && (
              <div className="form-stack">
                <p className="info-box">
                  回答は任意です。学習支援の改善に活用し、TAの個人ランキングには使用しません。
                </p>
                <label>
                  今回の指導に満足しましたか？
                  <div className="rating-stars">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        aria-label={`${v}点`}
                        className={survey.satisfaction >= v ? "selected" : ""}
                        onClick={() =>
                          setSurvey({ ...survey, satisfaction: v })
                        }
                      >
                        <Star size={31} />
                        <span>{v}</span>
                      </button>
                    ))}
                  </div>
                </label>
                {[
                  ["resolved", "質問内容は解決しましたか？"],
                  ["matched", "TAは相談内容に対応できていましたか？"],
                  ["returnIntent", "またiStudioを利用したいですか？"],
                ].map(([k, label]) => (
                  <label key={k}>
                    {label}
                    <select
                      value={String(survey[k as keyof typeof survey])}
                      onChange={(e) =>
                        setSurvey({ ...survey, [k]: e.target.value })
                      }
                    >
                      <option value="">選択してください</option>
                      <option value="true">はい</option>
                      <option value="false">いいえ</option>
                    </select>
                  </label>
                ))}
                <label>
                  改善してほしい点 <span className="optional">任意</span>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={survey.comment}
                    onChange={(e) =>
                      setSurvey({ ...survey, comment: e.target.value })
                    }
                  />
                </label>
              </div>
            )}
            {["cancel", "noShow"].includes(dialog.type) && (
              <p>
                {dialog.type === "cancel"
                  ? "この予約をキャンセルします。担当TAへキャンセル通知を送ります。"
                  : "学生が来室していないことを確認した上で、無断欠席として記録します。"}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setDialog(null)}
              >
                閉じる
              </button>
              <button
                className="button primary"
                disabled={
                  saving ||
                  (dialog.type === "record" && !fields.taught.trim()) ||
                  (dialog.type === "assign" && !assignTa) ||
                  (dialog.type === "survey" &&
                    (survey.satisfaction < 1 ||
                      survey.satisfaction > 5 ||
                      ![
                        survey.resolved,
                        survey.matched,
                        survey.returnIntent,
                      ].every((value) => ["true", "false"].includes(value))))
                }
                onClick={
                  ["cancel", "noShow"].includes(dialog.type)
                    ? async () => {
                        const ok = await action(
                          dialog.type === "cancel" ? "cancel" : "status",
                          dialog.type === "cancel"
                            ? { id: dialog.b.id }
                            : { id: dialog.b.id, status: "NO_SHOW" },
                        );
                        if (ok) setDialog(null);
                      }
                    : save
                }
              >
                {saving
                  ? "保存中…"
                  : dialog.type === "record"
                    ? "カルテを保存する"
                    : dialog.type === "survey"
                      ? "回答を送信する"
                      : dialog.type === "cancel"
                        ? "キャンセルする"
                        : "保存する"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export function HistoryPanel({ data }: { data: AppData }) {
  const [studentId, setStudentId] = useState("");
  const names = [
    ...new Map(
      data.bookings.map((b) => [
        b.studentId,
        { id: b.studentId, name: b.studentName },
      ]),
    ).values(),
  ];
  const records = data.records
    .filter((r) => !studentId || r.studentId === studentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LEARNING JOURNAL</span>
          <h1>学習カルテ</h1>
          <p>
            {data.viewer.role === "STUDENT"
              ? "相談で分かったこと、次に取り組むこと。あなたの学びの記録です。"
              : "担当・閲覧許可がある学生の記録だけを表示します。担当が変わっても必要な内容を引き継げます。"}
          </p>
        </div>
        <Badge tone="teal">権限に応じた履歴表示</Badge>
      </div>
      {data.viewer.role !== "STUDENT" && (
        <div className="panel search-toolbar">
          <label>
            <UsersRound size={18} />
            <select
              aria-label="学生で絞り込む"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">閲覧できるすべての記録</option>
              {names.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {records.length ? (
        <div className="record-timeline">
          {records.map((r) => (
            <article className="panel record-card" key={r.id}>
              <div className="record-head">
                <span className="record-icon">
                  <BookOpen size={21} />
                </span>
                <div>
                  <p>
                    {day(
                      data.bookings.find((b) => b.id === r.bookingId)?.start ||
                        r.createdAt,
                    )}{" "}
                    <Badge>架空データ</Badge>
                  </p>
                  <h2>{r.courseName}</h2>
                  <small>
                    担当 {r.taName}
                    {data.viewer.role !== "STUDENT" &&
                      ` · 内部ID ${r.studentId}`}
                  </small>
                </div>
              </div>
              <div className="record-details">
                {[
                  ["相談科目の単元", r.unitName || "科目全般"],
                  ["相談した内容", r.question || "相談時に共有"],
                  ["指導した内容", r.taught],
                  ["理解できた部分", r.understood],
                  ["これから取り組む問題", r.unresolved],
                  ["次回への引き継ぎ", r.handoff],
                ].map(([label, value]) => (
                  <div key={label}>
                    <h3>{label}</h3>
                    <p>{value || "記録なし"}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="学習記録はまだありません"
          text="指導後にTAが記録すると、ここから確認できます。"
        />
      )}
    </>
  );
}

export function WalkInPanel({
  data,
  action,
}: {
  data: AppData;
  action: Action;
}) {
  const [studentId, setStudentId] = useState("");
  const [courseId, setCourseId] = useState(data.courses[0]?.id || "");
  const [taId, setTaId] = useState("");
  const [question, setQuestion] = useState("");
  const [saving, setSaving] = useState(false);
  const course = data.courses.find((c) => c.id === courseId);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">WALK-IN SUPPORT</span>
          <h1>飛び込み利用の受付</h1>
          <p>
            予約がなくても利用できます。在室中のTAを確認して受付を記録します。
          </p>
        </div>
        <Badge tone="green">完全予約制にはしません</Badge>
      </div>
      <div className="two-column">
        <section className="panel form-panel">
          <h2>
            <DoorOpen size={20} />
            来室を受け付ける
          </h2>
          <div className="form-stack">
            <label>
              学生（内部ID）
              {data.students?.length ? (
                <select
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                >
                  <option value="">学生を選択してください</option>
                  {data.students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="学籍番号ではなく、学生の内部ID"
                />
              )}
            </label>
            <label>
              相談科目
              <select
                value={courseId}
                onChange={(e) => {
                  setCourseId(e.target.value);
                  setTaId("");
                }}
              >
                {data.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              担当TA
              <select value={taId} onChange={(e) => setTaId(e.target.value)}>
                <option value="">受付で相談先を調整（未割当）</option>
                {data.tas
                  .filter((t) => t.present && t.subjects.includes(courseId))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
              <span className="help">
                その科目に対応できる在室TAだけを直接選択できます。未確認の場合は受付で調整します。
              </span>
            </label>
            <label>
              相談内容 <span className="optional">任意</span>
              <textarea
                value={question}
                maxLength={2000}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
              />
            </label>
            <button
              className="button primary"
              disabled={!studentId || saving}
              onClick={async () => {
                setSaving(true);
                const ok = await action("walkIn", {
                  studentId,
                  courseId,
                  taId: taId || undefined,
                  question,
                });
                setSaving(false);
                if (ok) {
                  setQuestion("");
                  setStudentId("");
                }
              }}
            >
              <Check size={16} />
              {saving ? "受付中…" : "飛び込み利用を記録"}
            </button>
          </div>
        </section>
        <div>
          <div className="section-heading">
            <h2>現在在室しているTA</h2>
            <Badge tone="green">
              {data.tas.filter((t) => t.present).length} 名
            </Badge>
          </div>
          <div className="walkin-ta-list">
            {data.tas
              .filter((t) => t.present)
              .map((ta) => (
                <TaCard
                  key={ta.id}
                  ta={ta}
                  courses={data.courses}
                  course={course}
                />
              ))}
          </div>
        </div>
      </div>
    </>
  );
}
