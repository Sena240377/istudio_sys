"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
  ClipboardList,
  DoorOpen,
  GraduationCap,
  Home,
  Info,
  Leaf,
  LoaderCircle,
  LogOut,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import BookingDialog from "../components/BookingDialog";
import {
  AnalyticsPanel,
  ResearchPanel,
  SettingsPanel,
} from "../components/AdminPanels";
import {
  BookingsPanel,
  Dashboard,
  HistoryPanel,
  SearchPanel,
  WalkInPanel,
} from "../components/MainPanels";
import { Action, AppData, Role, roles } from "../components/types";
import { Badge, Modal } from "../components/ui";

const navigation = [
  {
    id: "home",
    label: "ホーム",
    icon: Home,
    roles: ["STUDENT", "TA", "TEACHER", "ADMIN"],
  },
  {
    id: "search",
    label: "TA・相談先を探す",
    icon: Search,
    roles: ["STUDENT", "TA", "TEACHER", "ADMIN"],
  },
  {
    id: "bookings",
    label: "予約・来室",
    icon: CalendarDays,
    roles: ["STUDENT", "TA", "TEACHER", "ADMIN"],
  },
  {
    id: "history",
    label: "学習カルテ",
    icon: BookOpen,
    roles: ["STUDENT", "TA", "TEACHER", "ADMIN"],
  },
  {
    id: "walkin",
    label: "飛び込み受付",
    icon: DoorOpen,
    roles: ["TA", "TEACHER", "ADMIN"],
  },
  {
    id: "analytics",
    label: "利用・品質の分析",
    icon: ChartNoAxesCombined,
    roles: ["ADMIN"],
  },
  {
    id: "research",
    label: "ヒアリング・検証",
    icon: ClipboardList,
    roles: ["ADMIN"],
  },
  {
    id: "settings",
    label: "設定・運用管理",
    icon: Settings2,
    roles: ["TEACHER", "ADMIN"],
  },
];
const demos = [
  {
    role: "STUDENT" as Role,
    name: "学生",
    email: "student1@example.test",
    description: "予約する・学びを振り返る",
  },
  {
    role: "TA" as Role,
    name: "TA",
    email: "ta1@example.test",
    description: "相談を確認・指導を記録",
  },
  {
    role: "TEACHER" as Role,
    name: "教員",
    email: "teacher@example.test",
    description: "受付と学習支援を管理",
  },
  {
    role: "ADMIN" as Role,
    name: "管理者",
    email: "admin@example.test",
    description: "運用・品質を検証",
  },
];
function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <BookOpen size={23} />
      </span>
      <div>
        <strong>
          iStudio<span className="brand-dot">.</span>
        </strong>
        <small>REITAKU UNIVERSITY</small>
      </div>
    </div>
  );
}
function DemoBanner() {
  return (
    <div className="demo-banner">
      <ShieldCheck size={14} />
      <strong>検証用プロトタイプ</strong>
      <span>掲載されている学生・TA・予約・履歴はすべて架空データです。</span>
      <Badge tone="amber">DEMO</Badge>
    </div>
  );
}

export default function Page() {
  const [data, setData] = useState<AppData | null>(null);
  const [boot, setBoot] = useState(true);
  const [tab, setTab] = useState("home");
  const [booking, setBooking] = useState<{
    course?: string;
    ta?: string;
  } | null>(null);
  const [notice, setNotice] = useState<{ kind: string; text: string } | null>(
    null,
  );
  const [menu, setMenu] = useState(false);
  const [about, setAbout] = useState(false);
  const [email, setEmail] = useState(demos[0].email);
  const [password, setPassword] = useState("Demo2026!");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [selectedDemo, setSelectedDemo] = useState<Role>("STUDENT");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/data", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 401) {
        setData(null);
        return;
      }
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error || "データを取得できませんでした。");
      setData(value);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "接続を確認してください。";
      setNotice({ kind: "error", text: message });
      setLoginError(message);
    } finally {
      setBoot(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [!!data, refresh]);
  const action: Action = async (action, payload = {}) => {
    try {
      const response = await fetch("/api/action", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": data?.csrfToken || "",
        },
        body: JSON.stringify({ action, ...payload }),
      });
      const value = await response.json();
      if (!response.ok || !value.ok)
        throw new Error(value.error || "操作を保存できませんでした。");
      await refresh();
      setNotice({
        kind: "success",
        text:
          action === "book"
            ? "相談予約を受け付けました。予約一覧で確認できます。"
            : action === "checkIn"
              ? "チェックインしました。受付でお待ちください。"
              : action === "survey"
                ? "ご回答ありがとうございます。学習支援の改善に活用します。"
                : "変更を保存しました。",
      });
      return true;
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error ? error.message : "接続を確認してください。",
      });
      return false;
    }
  };
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error || "ログインできませんでした。");
      setTab("home");
      await refresh();
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : "接続を確認してください。",
      );
    } finally {
      setLoginBusy(false);
    }
  }
  async function logout() {
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": data?.csrfToken || "",
        },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!response.ok) throw new Error("ログアウトできませんでした。");
      setData(null);
      setNotice(null);
      setTab("home");
    } catch {
      setNotice({
        kind: "error",
        text: "ログアウトできませんでした。接続を確認してください。",
      });
    }
  }
  function navigate(id: string) {
    setTab(id);
    setMenu(false);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (boot)
    return (
      <div className="boot-screen">
        <Brand />
        <LoaderCircle className="spin" size={25} />
        <p>学習スペースを準備しています…</p>
      </div>
    );
  if (!data)
    return (
      <>
        <DemoBanner />
        <main className="login-page">
          <section className="login-story">
            <Brand />
            <div className="login-story-main">
              <span className="eyebrow">LEARN. ASK. GROW.</span>
              <h1>
                一人で悩む時間を、
                <br />
                一緒に学ぶ時間に。
              </h1>
              <p>
                「これ、どう考えたらいいんだろう？」
                <br />
                その小さな疑問から、iStudioの学習相談は始まります。
              </p>
              <div className="login-illustration" aria-hidden="true">
                <div className="login-circle" />
                <div className="login-book">
                  <BookOpen size={75} />
                  <span>YOUR NEXT STEP</span>
                </div>
                <div className="login-bubble">
                  <MessageIcon />
                  一緒に考えよう。
                </div>
                <span className="login-star">✦</span>
              </div>
              <div className="login-values">
                <span>
                  <ClockIcon />
                  1回35分の学習相談
                </span>
                <span>
                  <Leaf size={17} />
                  簡単予約・飛び込みも
                </span>
              </div>
            </div>
            <div className="university-caption">
              <GraduationCap size={21} />
              <span>
                麗澤大学 iStudio
                <br />
                <small>学習支援・予約管理システム</small>
              </span>
            </div>
          </section>
          <section className="login-form-side">
            <div className="login-form-card">
              <Badge tone="teal">独立した検証用プロトタイプ</Badge>
              <h2>iStudioへようこそ</h2>
              <p>デモアカウントで、学習支援の流れを体験できます。</p>
              <div className="demo-account-grid">
                {demos.map((d) => (
                  <button
                    key={d.role}
                    className={selectedDemo === d.role ? "selected" : ""}
                    onClick={() => {
                      setSelectedDemo(d.role);
                      setEmail(d.email);
                      setPassword("Demo2026!");
                      setLoginError("");
                    }}
                  >
                    <UserRound size={17} />
                    <strong>{d.name}</strong>
                    <span>{d.description}</span>
                  </button>
                ))}
              </div>
              <form onSubmit={login} className="form-stack">
                <label>
                  メールアドレス
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  パスワード
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                {loginError && (
                  <p role="alert" className="form-error">
                    {loginError}
                  </p>
                )}
                <button
                  className="button primary full login-submit"
                  type="submit"
                  disabled={loginBusy}
                >
                  {loginBusy ? (
                    <LoaderCircle size={18} className="spin" />
                  ) : (
                    <ArrowRight size={18} />
                  )}{" "}
                  {loginBusy ? "ログイン中…" : "デモにログインする"}
                </button>
              </form>
              <p className="login-password">
                共通デモパスワード：<code>Demo2026!</code>
              </p>
              <div className="login-security">
                <ShieldCheck size={19} />
                <p>
                  権限に応じて閲覧できる情報を制限します。
                  <br />
                  実在する学生の個人情報は使用していません。
                </p>
              </div>
            </div>
            <p className="login-note">
              本番運用には、大学の承認と現場での検証が必要です。
            </p>
          </section>
        </main>
      </>
    );
  const nav = navigation.filter((n) => n.roles.includes(data.viewer.role));
  const current = nav.find((n) => n.id === tab) || nav[0];
  const unread = data.notifications.filter((n) => !n.read).length;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">学びをつなぐ、相談スペース</div>
        <nav aria-label="メインナビゲーション">
          {nav.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "home" && unread > 0 && (
                <b className="nav-count">{unread}</b>
              )}
            </button>
          ))}
        </nav>
        {data.viewer.role === "STUDENT" && (
          <div className="sidebar-invitation">
            <span className="invite-icon">
              <Leaf size={23} />
            </span>
            <h3>
              質問がまとまって
              <br />
              いなくても大丈夫。
            </h3>
            <p>科目だけ選んで、気軽に相談してみましょう。</p>
            <button onClick={() => setBooking({})}>
              相談を予約する
              <ArrowRight size={15} />
            </button>
          </div>
        )}
        <div className="sidebar-bottom">
          <button className="sidebar-help" onClick={() => setAbout(true)}>
            <Info size={17} />
            このシステムについて
          </button>
          <div className="sidebar-university">
            <GraduationCap size={21} />
            <span>
              麗澤大学 iStudio<small>独立した検証環境 · v1.0</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="メニューを開く"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X size={22} /> : <Menu size={22} />}
          </button>
          <div className="breadcrumb">
            iStudio <ChevronSeparator /> <strong>{current.label}</strong>
          </div>
          <div className="topbar-right">
            <button
              className="notification-button"
              aria-label={`通知 ${unread} 件`}
              onClick={() => navigate("home")}
            >
              <Bell size={19} />
              {unread > 0 && <i />}
            </button>
            <div className="user-chip">
              <div className="user-avatar">{data.viewer.name.slice(0, 1)}</div>
              <span>
                {data.viewer.name}
                <small>{roles[data.viewer.role]}アカウント</small>
              </span>
            </div>
            <button
              className="icon-button logout-button"
              onClick={logout}
              title="ログアウト"
              aria-label="ログアウト"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <DemoBanner />
        {menu && (
          <nav className="mobile-navigation" aria-label="モバイルメニュー">
            {nav.map((n) => (
              <button
                key={n.id}
                className={tab === n.id ? "active" : ""}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={18} />
                {n.label}
              </button>
            ))}
            <button onClick={() => setAbout(true)}>
              <Info size={18} />
              システムについて
            </button>
          </nav>
        )}
        <main className="main-content">
          {notice && (
            <div
              className={`notice notice-${notice.kind}`}
              role={notice.kind === "error" ? "alert" : "status"}
            >
              {notice.kind === "error" ? (
                <Info size={18} />
              ) : (
                <CheckCircle2 size={18} />
              )}
              <p>{notice.text}</p>
              <button
                className="icon-button"
                aria-label="メッセージを閉じる"
                onClick={() => setNotice(null)}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {tab === "home" && (
            <Dashboard
              data={data}
              action={action}
              book={() => setBooking({})}
              navigate={navigate}
            />
          )}{" "}
          {tab === "search" && (
            <SearchPanel
              data={data}
              book={(course, ta) => setBooking({ course, ta })}
            />
          )}{" "}
          {tab === "bookings" && (
            <BookingsPanel
              data={data}
              action={action}
              book={() => setBooking({})}
            />
          )}{" "}
          {tab === "history" && <HistoryPanel data={data} />}{" "}
          {tab === "walkin" && <WalkInPanel data={data} action={action} />}{" "}
          {tab === "analytics" && data.viewer.role === "ADMIN" && (
            <AnalyticsPanel data={data} />
          )}{" "}
          {tab === "research" && data.viewer.role === "ADMIN" && (
            <ResearchPanel data={data} action={action} />
          )}{" "}
          {tab === "settings" &&
            ["TEACHER", "ADMIN"].includes(data.viewer.role) && (
              <SettingsPanel data={data} action={action} />
            )}
          <footer className="content-footer">
            <span>iStudio · 麗澤大学 学習支援</span>
            <span>誰もが気軽に相談できる、学びの場所。</span>
          </footer>
        </main>
      </div>
      {booking && (
        <BookingDialog
          data={data}
          action={action}
          close={() => setBooking(null)}
          initialCourse={booking.course}
          initialTa={booking.ta}
        />
      )}{" "}
      {about && (
        <Modal title="このシステムについて" close={() => setAbout(false)}>
          <div className="booking-body">
            <p>
              iStudioで適切な学習支援を受けられる割合を高めるための、独立した検証用プロトタイプです。
            </p>
            <div className="info-box">
              すべての学生・TA・履歴は架空データです。実際の利用者の発言や、現行システムの仕様を推測で登録していません。
            </div>
            <div className="record-details">
              <div>
                <h3>柔軟な相談先の選択</h3>
                <p>
                  対応可能・関連分野・未確認を区別し、関連分野は事前確認を行います。相談先が見つからない場合も、一般相談・教員への相談ができます。
                </p>
              </div>
              <div>
                <h3>品質を複数の指標で検証</h3>
                <p>
                  満足度・ミスマッチ・予約成立・利用人数・キャンセル・事前準備・有効な指導時間を測定します。目標値を自動設定しません。
                </p>
              </div>
              <div>
                <h3>要ヒアリングの事項</h3>
                <p>
                  既存システムの詳細仕様、現場の運用理由、科目分類、導入前の指標、IC機材の仕様は未確認です。SimplyBook.meなどの現行システムは変更していません。
                </p>
              </div>
            </div>
            <button
              className="button primary full"
              onClick={() => setAbout(false)}
            >
              確認しました
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function ChevronSeparator() {
  return <span className="breadcrumb-separator">/</span>;
}
function MessageIcon() {
  return <BookOpen size={19} />;
}
function ClockIcon() {
  return <CalendarDays size={17} />;
}
