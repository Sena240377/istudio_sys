"use client";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  MessageCircle,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  Action,
  AppData,
  Course,
  day,
  match,
  time,
  dateKey,
  fieldLabel,
} from "./types";
import { Badge, Empty, MatchBadge, Modal, TaCard } from "./ui";

export default function BookingDialog({
  data,
  action,
  close,
  initialCourse,
  initialTa,
}: {
  data: AppData;
  action: Action;
  close: () => void;
  initialCourse?: string;
  initialTa?: string;
}) {
  const [mode, setMode] = useState<"SIMPLE" | "DETAILED">("SIMPLE");
  const [step, setStep] = useState(0);
  const [courseId, setCourseId] = useState(
    initialCourse || data.courses[0]?.id || "",
  );
  const [unitId, setUnitId] = useState("");
  const [question, setQuestion] = useState("");
  const [taId, setTaId] = useState(initialTa || "");
  const [route, setRoute] = useState<"TA" | "GENERAL" | "TEACHER">("TA");
  const [slotId, setSlotId] = useState("");
  const [slotDay, setSlotDay] = useState("");
  const [start, setStart] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const course = data.courses.find((c) => c.id === courseId);
  const ta = data.tas.find((t) => t.id === taId);
  const slot = ta?.availability.find((s) => s.id === slotId);
  const steps = mode === "SIMPLE" ? [0, 2, 3, 4] : [0, 1, 5, 2, 3, 4];
  const stepIndex = steps.indexOf(step);
  const titles: Record<number, string> = {
    0: "相談したい科目を選びましょう",
    1: "相談する単元を選びましょう",
    5: "今、どこで困っていますか？",
    2: "相談の相手を選びましょう",
    3: "都合のよい日時を選びましょう",
    4: "この内容で相談を予約します",
  };
  const available = useMemo(
    () => ta?.availability.filter((s) => new Date(s.start) > new Date()) || [],
    [ta],
  );
  const publicSlots = useMemo(
    () =>
      (
        data.generalAvailability || [
          ...new Map(
            data.tas.flatMap((t) => t.availability).map((s) => [s.start, s]),
          ).values(),
        ]
      )
        .filter((s) => new Date(s.start) > new Date())
        .sort((a, b) => a.start.localeCompare(b.start)),
    [data.generalAvailability, data.tas],
  );
  const visibleSlots = route === "TA" ? available : publicSlots;
  const days = [...new Set(visibleSlots.map((s) => dateKey(s.start)))];
  const chosenDay = days.includes(slotDay) ? slotDay : days[0];
  function next() {
    setError("");
    if (step === 0 && !courseId) return setError("科目を選択してください。");
    if (step === 2 && route === "TA" && !ta)
      return setError("TAまたは一般相談・教員相談を選択してください。");
    if (step === 3 && ((route === "TA" && !slot) || (route !== "TA" && !start)))
      return setError("相談日時を選択してください。");
    setStep(steps[stepIndex + 1]);
  }
  async function submit() {
    setSaving(true);
    const ok = await action("book", {
      courseId,
      unitId: mode === "DETAILED" ? unitId || undefined : undefined,
      question: mode === "DETAILED" ? question : "",
      taId: route === "TA" ? taId : undefined,
      slotId: route === "TA" ? slotId : undefined,
      start: route !== "TA" ? start : undefined,
      route,
      mode,
    });
    setSaving(false);
    if (ok) close();
    else
      setError("予約を保存できませんでした。画面上のエラーをご確認ください。");
  }
  return (
    <Modal title="学習相談を予約" close={close} wide>
      <div className="booking-body">
        <div className="mode-toggle">
          <button
            className={mode === "SIMPLE" ? "active" : ""}
            onClick={() => {
              setMode("SIMPLE");
              setStep(0);
            }}
          >
            <Sparkles size={16} />
            簡単予約
          </button>
          <button
            className={mode === "DETAILED" ? "active" : ""}
            onClick={() => {
              setMode("DETAILED");
              setStep(0);
            }}
          >
            <MessageCircle size={16} />
            詳細予約
          </button>
        </div>
        <p className="help">
          {mode === "SIMPLE"
            ? "科目と日時を選ぶだけ。質問は相談のときに伝えられます。"
            : "単元と質問を事前に共有すると、TAが準備しやすくなります。入力は任意です。"}
        </p>
        <div className="steps">
          {steps.map((s, i) => (
            <div key={s} className={i <= stepIndex ? "done" : ""}>
              <span>{i < stepIndex ? <Check size={12} /> : i + 1}</span>
              <small>
                {
                  (
                    {
                      0: "科目",
                      1: "単元",
                      5: "質問",
                      2: "相談先",
                      3: "日時",
                      4: "確認",
                    } as Record<number, string>
                  )[s]
                }
              </small>
            </div>
          ))}
        </div>
        <h3 className="booking-title">{titles[step]}</h3>
        {step === 0 && (
          <div className="course-grid">
            {data.courses.map((c) => (
              <button
                key={c.id}
                className={`course-choice ${c.id === courseId ? "selected" : ""}`}
                onClick={() => {
                  setCourseId(c.id);
                  setUnitId("");
                  if (c.id !== courseId) setTaId("");
                  setSlotId("");
                }}
              >
                <span>{fieldLabel(c.field)}</span>
                <strong>{c.name}</strong>
                {c.id === courseId && <Check size={17} />}
              </button>
            ))}
          </div>
        )}
        {step === 1 && (
          <div className="form-stack">
            <label>
              単元 <span className="optional">任意</span>
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
              >
                <option value="">まだ決まっていない / 科目全般</option>
                {course?.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {step === 5 && (
          <div className="form-stack">
            <label>
              具体的な質問 <span className="optional">任意</span>
              <textarea
                maxLength={2000}
                rows={5}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="例：for文とwhile文の使い分けを、課題のコードで確認したいです。"
              />
              <span className="help">
                分かる範囲で大丈夫です。個人情報やパスワードは入力しないでください。
              </span>
            </label>
          </div>
        )}
        {step === 2 && (
          <>
            <div className="info-box">
              専門科目の完全一致は必須ではありません。関連分野のTAへの相談は、TAが対応できるか確認してから確定します。
            </div>
            <div className="ta-grid booking-ta-grid">
              {data.tas.map((t) => (
                <TaCard
                  key={t.id}
                  ta={t}
                  courses={data.courses}
                  course={course as Course}
                  selected={route === "TA" && taId === t.id}
                  onSelect={() => {
                    setTaId(t.id);
                    setRoute("TA");
                    setSlotId("");
                    setSlotDay("");
                  }}
                />
              ))}
            </div>
            <div className="alternative-grid">
              <button
                className={`alternative ${route === "GENERAL" ? "selected" : ""}`}
                onClick={() => {
                  setRoute("GENERAL");
                  setTaId("");
                }}
              >
                <MessageCircle size={20} />
                <strong>一般相談・相談先の調整</strong>
                <span>
                  科目に合うTAが見つからないときも、受付に相談できます。
                </span>
              </button>
              <button
                className={`alternative ${route === "TEACHER" ? "selected" : ""}`}
                onClick={() => {
                  setRoute("TEACHER");
                  setTaId("");
                }}
              >
                <UserRound size={20} />
                <strong>教員に相談をつなぐ</strong>
                <span>
                  対応未確認のTAへ自動で割り当てず、教員が確認します。
                </span>
              </button>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <div className="selected-summary">
              <UserRound size={20} />
              <strong>
                {route === "TA"
                  ? ta?.name
                  : route === "GENERAL"
                    ? "一般相談・受付調整"
                    : "教員への相談"}
              </strong>
              <Badge tone="teal">1回 35分</Badge>
            </div>
            {route !== "TA" && (
              <div className="info-box">
                公開されている相談時間から希望日時を選びます。受付による調整が必要なため、送信時点では担当者は未確定です。
              </div>
            )}
            {days.length ? (
              <>
                <div className="day-tabs">
                  {days.map((d) => (
                    <button
                      key={d}
                      className={d === chosenDay ? "selected" : ""}
                      onClick={() => setSlotDay(d)}
                    >
                      {day(`${d}T12:00:00+09:00`)}
                    </button>
                  ))}
                </div>
                <div className="slot-grid">
                  {visibleSlots
                    .filter((s) => dateKey(s.start) === chosenDay)
                    .map((s) => (
                      <button
                        key={s.id}
                        className={
                          (route === "TA" ? s.id === slotId : s.start === start)
                            ? "selected"
                            : ""
                        }
                        onClick={() =>
                          route === "TA" ? setSlotId(s.id) : setStart(s.start)
                        }
                      >
                        <Clock3 size={16} />
                        {time(s.start)} – {time(s.end)}
                      </button>
                    ))}
                </div>
              </>
            ) : (
              <Empty
                title="公開中の相談枠はありません"
                text="別のTAを選ぶか、勤務予定の公開後に確認してください。"
              />
            )}
          </>
        )}
        {step === 4 && (
          <>
            <div className="booking-review">
              <div>
                <span>相談科目</span>
                <strong>{course?.name}</strong>
              </div>
              <div>
                <span>単元</span>
                <strong>
                  {course?.units.find((u) => u.id === unitId)?.name ||
                    "科目全般 / 相談時に確認"}
                </strong>
              </div>
              <div>
                <span>相談先</span>
                <strong>
                  {route === "TA"
                    ? ta?.name
                    : route === "GENERAL"
                      ? "一般相談・受付調整"
                      : "教員への相談"}
                </strong>
              </div>
              <div>
                <span>日時</span>
                <strong>
                  <CalendarDays size={16} />
                  {slot
                    ? `${day(slot.start)} ${time(slot.start)} – ${time(slot.end)}`
                    : `${day(start)} ${time(start)}（35分）`}
                </strong>
              </div>
              <div>
                <span>質問内容</span>
                <p>
                  {mode === "DETAILED" && question
                    ? question
                    : "相談時に伝えます"}
                </p>
              </div>
            </div>
            {route === "TA" && (
              <MatchBadge level={match(ta!, course)} course={course} />
            )}
            <div className="info-box">
              {route !== "TA" || match(ta!, course) === 2
                ? "対応確認待ちとして受け付けます。対応が確認されるまでは予約は確定しません。"
                : "この予約は確定し、担当TAへ通知されます。"}
              <br />
              すべてのデータは検証用の架空データとして保存されます。
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            className="button secondary"
            onClick={() =>
              stepIndex > 0 ? setStep(steps[stepIndex - 1]) : close()
            }
          >
            <ArrowLeft size={16} />
            {stepIndex > 0 ? "戻る" : "閉じる"}
          </button>
          {step === 4 ? (
            <button
              className="button primary"
              onClick={submit}
              disabled={saving}
            >
              <Check size={17} />
              {saving
                ? "保存中…"
                : route === "TA" && match(ta!, course) === 1
                  ? "予約を確定する"
                  : "相談を申し込む"}
            </button>
          ) : (
            <button className="button primary" onClick={next}>
              次へ
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
