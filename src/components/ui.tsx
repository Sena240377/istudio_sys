"use client";
import { X, CheckCircle2, HelpCircle, Leaf, ArrowUpRight } from "lucide-react";
import { ReactNode, useEffect, useRef } from "react";
import { Booking, Course, Ta, fieldLabel, match, statuses } from "./types";
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current
      ?.querySelector<HTMLElement>("button,input,select,textarea,a[href]")
      ?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-scrim" onClick={close}>
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "modal-wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          if (e.key === "Tab") {
            const items = dialog.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
            );
            if (!items?.length) return;
            const first = items[0],
              last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="modal-top">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="閉じる" onClick={close}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Empty({
  title = "まだ記録がありません",
  text = "記録された情報は、ここに表示されます。",
  children,
}: {
  title?: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Leaf size={26} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Status({ booking }: { booking: Booking }) {
  const waiting =
    booking.status === "BOOKED" && booking.confirmation === "PENDING";
  const declined =
    booking.status === "BOOKED" && booking.confirmation === "DECLINED";
  return (
    <Badge
      tone={
        booking.status === "COMPLETED"
          ? "green"
          : waiting || declined || booking.status === "PENDING"
            ? "amber"
            : booking.status === "CANCELLED" || booking.status === "REJECTED"
              ? "neutral"
              : "teal"
      }
    >
      {waiting
        ? booking.taId
          ? "対応確認待ち"
          : "相談先の調整待ち"
        : declined
          ? "対応困難・再相談"
          : statuses[booking.status] || booking.status}
    </Badge>
  );
}
export function MatchBadge({
  level,
  course,
}: {
  level: number;
  course?: Course;
}) {
  return (
    <div className={`match-label level-${level}`}>
      {level === 1 ? <CheckCircle2 size={15} /> : <HelpCircle size={15} />}
      <span>
        {level === 1
          ? `対応可能${course ? `：${course.name}` : ""}`
          : level === 2
            ? "関連分野に対応：事前確認を推奨"
            : "対応可否は未確認です"}
      </span>
    </div>
  );
}
export function TaCard({
  ta,
  courses,
  course,
  onSelect,
  selected = false,
}: {
  ta: Ta;
  courses: Course[];
  course?: Course;
  onSelect?: () => void;
  selected?: boolean;
}) {
  const level = match(ta, course);
  return (
    <article className={`ta-card ${selected ? "selected" : ""}`}>
      <div className="ta-card-top">
        <div className="avatar">
          {ta.name.replace("（架空）", "").slice(0, 1)}
        </div>
        <div>
          <h3>{ta.name}</h3>
          <span className={`presence ${ta.present ? "present" : ""}`}>
            <i />
            {ta.present ? "現在在室しています" : "勤務時間に対応"}
          </span>
        </div>
      </div>
      {course && <MatchBadge level={level} course={course} />}
      <p className="label">対応可能な科目</p>
      <div className="tags">
        {courses
          .filter((c) => ta.subjects.includes(c.id))
          .map((c) => (
            <span key={c.id}>{c.name}</span>
          ))}
      </div>
      <p className="ta-units">
        得意分野：{ta.expertise.map(fieldLabel).join("・") || "未登録"}
        <br />
        単元：{ta.units.join("・") || "相談時に確認"}
      </p>
      <div className="ta-footer">
        <span>
          {ta.availability.length
            ? `${ta.availability.length} 件の相談枠`
            : "空き枠なし"}
        </span>
        {onSelect && (
          <button
            className="text-button"
            onClick={onSelect}
            disabled={!!course && level === 3}
          >
            {selected ? "選択中" : course ? "このTAに相談" : "科目から相談"}
            <ArrowUpRight size={16} />
          </button>
        )}
      </div>
    </article>
  );
}
