"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Feather,
  Search,
  ShieldCheck,
  MessageCircle,
  MapPin,
  ChevronRight,
  Check,
  X,
  LockKeyhole,
  SlidersHorizontal,
  Heart,
  Leaf,
  CalendarDays,
  Clock3,
  UserRound,
  LogOut,
  Upload,
  FileCheck2,
  FileText,
  ImagePlus,
  Send,
  MoreHorizontal,
  Eye,
  EyeOff,
  Pause,
  Play,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  ClipboardList,
  Sprout,
  CreditCard,
  Users,
  Trash2,
  Settings2,
} from "lucide-react";
import {
  Academic,
  Donor,
  ProfileData,
  User,
  PREFECTURES,
  WEEKDAYS,
  HAIR,
  BLOOD,
  INFECTIONS,
  SEMEN_FIELDS,
  DOC_LABELS,
  emptyProfile,
  dateExpired,
} from "@/lib/shared";

async function api(url: string, method = "GET", data?: unknown) {
  const res = await fetch("/api/" + url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    cache: "no-store",
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "処理を完了できませんでした。");
  return result;
}
async function upload(file: File, kind: string, conversationId?: string) {
  const form = new FormData();
  form.set("file", file);
  form.set("kind", kind);
  if (conversationId) form.set("conversationId", conversationId);
  const res = await fetch("/api/files", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.file;
}
type Context = {
  user: User | null;
  demo: boolean;
  paymentMode: string;
  notify: (message: string) => void;
  signIn: (role?: "donor" | "recipient") => void;
  refresh: () => Promise<void>;
};
type FileInfo = { id: string; kind: string; original_name: string };
const STATE_LABELS: Record<string, string> = {
  payment_pending: "支払い待ち",
  queued: "審査待ち",
  reviewing: "審査中",
  needs_changes: "修正が必要",
  approved: "承認済み",
  rejected: "不承認",
  draft: "未申請",
  paused: "募集休止中",
  suspended: "管理者による掲載停止",
  requested: "会話の申請中",
  accepted: "会話中",
  declined: "申請辞退",
  blocked: "ブロック済み",
  deleted: "退会済み",
};
const value = (n: number | null | undefined, unit = "") =>
  n === null || n === undefined ? (
    <span className="nodata">NoData</span>
  ) : (
    <>
      {n}
      <small>{unit}</small>
    </>
  );
function Busy() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={23} />
      <span>読み込み中</span>
    </div>
  );
}
function Empty({
  title,
  children,
  icon = <Sprout size={34} />,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <div>{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Field({
  label,
  children,
  note,
  required,
}: {
  label: string;
  children: ReactNode;
  note?: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <b className="required">必須</b>}
      </span>
      {children}
      {note && <small>{note}</small>}
    </label>
  );
}
function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
function Chips({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="choices">
      {options.map((s) => (
        <button
          type="button"
          className={selected.includes(s) ? "choice selected" : "choice"}
          key={s}
          aria-pressed={selected.includes(s)}
          onClick={() =>
            onChange(
              selected.includes(s)
                ? selected.filter((x) => x !== s)
                : [...selected, s],
            )
          }
        >
          {selected.includes(s) && <Check size={14} />} {s}
        </button>
      ))}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("button,input,select")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = ref.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]),select,a[href]",
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      before?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="閉じる" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function BirdArt() {
  return (
    <svg viewBox="0 0 460 430" className="bird-art" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" x2="1" y2="1">
          <stop stopColor="#e2e9dd" />
          <stop offset="1" stopColor="#f1eee3" />
        </linearGradient>
      </defs>
      <circle cx="236" cy="209" r="176" fill="url(#sky)" />
      <circle
        cx="236"
        cy="209"
        r="148"
        fill="none"
        stroke="#c2cdbe"
        strokeWidth="1"
        strokeDasharray="3 7"
      />
      <path
        d="M46 336c73-3 111-60 147-67M337 101c33-42 55-53 78-49"
        fill="none"
        stroke="#b4c2ae"
        strokeWidth="1.5"
      />
      <g
        fill="none"
        stroke="#3e654f"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M105 206c25 4 47 2 63-4 35-15 52-38 72-40 14-2 28 7 41 17l50-29-35 37c-11 12-33 18-43 19-32 4-62 10-88 36l-34 3 24-24-50-15Z"
          fill="#faf9f3"
        />
        <path
          d="M178 198c-5-61-1-105 26-132 1 53 18 88 42 100M169 204c-17-43-31-95-16-127 13 42 35 70 60 96M164 213c-43-9-83-28-96-53 49 9 83 9 105 31"
          fill="#faf9f3"
        />
        <path d="m281 179 44-1-28 9M252 209l-27 56 22 38M266 207l-20 60 21 31M228 266l-23 16M247 301l18 5" />
        <path
          d="M194 82c-3 36 10 64 28 85M153 95c7 34 24 62 47 81M87 167c29 8 51 13 74 24"
          stroke="#a6b6a3"
          strokeWidth="1.2"
        />
      </g>
      <circle cx="276" cy="178" r="2.6" fill="#294c38" />
      <g stroke="#8b9f80" fill="none" strokeWidth="1.5">
        <path d="M105 333c12-34 31-50 53-56M105 333c5-16-2-28-14-32M110 318c13 1 25-6 29-17M120 301c-4-16 1-26 14-31M141 286c16 2 27-3 33-16" />
        <path d="M361 292c-5-26 1-52 11-66M366 257c-11-6-17-16-16-26M366 257c15-6 20-15 19-28M359 279c16-5 23-11 24-23" />
      </g>
      <circle cx="89" cy="117" r="3" fill="#bdc7b2" />
      <circle cx="362" cy="347" r="4" fill="#bdc7b2" />
      <path d="m329 72 5 5-5 5-5-5Z" fill="#b9c6af" />
    </svg>
  );
}

export default function App() {
  const pathname = usePathname(),
    router = useRouter();
  const [user, setUser] = useState<User | null>(null),
    [demo, setDemo] = useState(false),
    [paymentMode, setPaymentMode] = useState(""),
    [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<"login" | "signup" | null>(null),
    [role, setRole] = useState<"donor" | "recipient">("recipient"),
    [account, setAccount] = useState(false),
    [toast, setToast] = useState("");
  const notify = useCallback((m: string) => setToast(m), []);
  const refresh = useCallback(async () => {
    try {
      const r = await api("me");
      setUser(r.user);
      setDemo(r.demo);
      setPaymentMode(r.paymentMode);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setReady(true);
    }
  }, [notify]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 6500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const closeAuth = useCallback(() => setAuth(null), []),
    closeAccount = useCallback(() => setAccount(false), []);
  const ctx: Context = {
    user,
    demo,
    paymentMode,
    notify,
    refresh,
    signIn: (r) => {
      if (r) setRole(r);
      setAuth("signup");
    },
  };
  const demoLogin = async (r: string) => {
    try {
      const result = await api("auth/demo", "POST", { role: r });
      setUser(result.user);
      router.push(
        r === "admin" ? "/admin" : r === "donor" ? "/register" : "/donors",
      );
      notify("デモアカウントに切り替えました。");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  let content: ReactNode;
  if (pathname === "/") content = <Home ctx={ctx} />;
  else if (pathname === "/donors") content = <SearchPage ctx={ctx} />;
  else if (pathname.startsWith("/donors/"))
    content = (
      <DonorPage
        key={pathname + user?.id}
        ctx={ctx}
        donorId={pathname.split("/")[2]}
      />
    );
  else if (pathname === "/register")
    content = <Registration key={user?.id || "public"} ctx={ctx} />;
  else if (pathname === "/chat")
    content = ready ? (
      <ChatPage key={user?.id || "public"} ctx={ctx} />
    ) : (
      <Busy />
    );
  else if (pathname === "/admin")
    content = ready ? (
      <AdminPage key={user?.id || "public"} ctx={ctx} />
    ) : (
      <Busy />
    );
  else if (["/terms", "/privacy", "/commerce"].includes(pathname))
    content = <LegalPage page={pathname} />;
  else
    content = (
      <div className="page-shell">
        <Empty title="ページが見つかりません">
          <Link href="/">トップページへ戻る</Link>
        </Empty>
      </div>
    );
  return (
    <>
      {demo && (
        <div className="demo-bar">
          <span>
            <span className="demo-dot" />
            デモ環境{" "}
            <span className="demo-explain">
              掲載情報は架空です。実際の課金・提供はありません。
            </span>
          </span>
          <div>
            <button onClick={() => demoLogin("recipient")}>希望者で試す</button>
            <button onClick={() => demoLogin("donor")}>提供者で試す</button>
            <button onClick={() => demoLogin("admin")}>管理者で試す</button>
          </div>
        </div>
      )}
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <Feather size={26} strokeWidth={1.5} />
            </span>
            <span>
              コウノトリのつばさ<small>KOUNOTORI NO TSUBASA</small>
            </span>
          </Link>
          <nav aria-label="メインナビゲーション">
            <Link
              className={pathname.startsWith("/donors") ? "nav-active" : ""}
              href="/donors"
            >
              提供者を探す
            </Link>
            <Link href="/#guide">はじめての方へ</Link>
            {user && (
              <Link
                className={pathname === "/chat" ? "nav-active" : ""}
                href="/chat"
              >
                チャット
              </Link>
            )}
            {user?.role === "admin" && (
              <Link
                className={pathname === "/admin" ? "nav-active" : ""}
                href="/admin"
              >
                管理
              </Link>
            )}
          </nav>
          <div className="header-actions">
            {user ? (
              <button
                className="account-button"
                onClick={() => setAccount(true)}
              >
                <UserRound size={17} />
                <span>{user.displayId}</span>
              </button>
            ) : (
              <button className="text-button" onClick={() => setAuth("login")}>
                ログイン
              </button>
            )}
            <Link className="button button-small" href="/register">
              提供者登録
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </header>
      <main>{content}</main>
      <footer className="site-footer">
        <div className="footer-top">
          <div>
            <Link href="/" className="brand">
              <Feather size={25} />
              <span>コウノトリのつばさ</span>
            </Link>
            <p>
              情報を確かめて、対話を重ねる。
              <br />
              納得できる選択を、あなたのペースで。
            </p>
          </div>
          <div className="footer-links">
            <Link href="/donors">提供者を探す</Link>
            <Link href="/register">提供者登録</Link>
            <Link href="/terms">利用規約</Link>
            <Link href="/privacy">プライバシー</Link>
            <Link href="/commerce">特定商取引法に基づく表記</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} コウノトリのつばさ</span>
          <span>日本国内向け・18歳以上の方のためのサービス</span>
        </div>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <AlertCircle size={18} />
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="通知を閉じる">
            <X size={15} />
          </button>
        </div>
      )}
      {auth && (
        <AuthModal
          mode={auth}
          setMode={setAuth}
          role={role}
          setRole={setRole}
          onClose={closeAuth}
          ctx={ctx}
        />
      )}
      {account && user && <AccountModal ctx={ctx} onClose={closeAccount} />}
    </>
  );
}
function AuthModal({
  mode,
  setMode,
  role,
  setRole,
  onClose,
  ctx,
}: {
  mode: "login" | "signup";
  setMode: (v: "login" | "signup") => void;
  role: "donor" | "recipient";
  setRole: (v: "donor" | "recipient") => void;
  onClose: () => void;
  ctx: Context;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [birth, setBirth] = useState(""),
    [agreed, setAgreed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api(
        "auth/" + (mode === "login" ? "login" : "signup"),
        "POST",
        { email, password, role, birthDate: birth, agreed },
      );
      await ctx.refresh();
      onClose();
      if (mode === "signup")
        router.push(r.user.role === "donor" ? "/register" : "/donors");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={mode === "login" ? "おかえりなさい" : "ここから、はじめましょう"}
      onClose={onClose}
    >
      <p className="muted">
        {mode === "login"
          ? "登録したメールアドレスでログインしてください。"
          : "希望者の登録・利用は無料です。"}
      </p>
      <div className="tabs">
        <button
          className={mode === "login" ? "active" : ""}
          onClick={() => setMode("login")}
        >
          ログイン
        </button>
        <button
          className={mode === "signup" ? "active" : ""}
          onClick={() => setMode("signup")}
        >
          新規登録
        </button>
      </div>
      <form onSubmit={submit} className="form-stack">
        {mode === "signup" && (
          <Field label="利用区分">
            <div className="choices">
              <button
                type="button"
                className={role === "recipient" ? "choice selected" : "choice"}
                onClick={() => setRole("recipient")}
              >
                提供を希望する
              </button>
              <button
                type="button"
                className={role === "donor" ? "choice selected" : "choice"}
                onClick={() => setRole("donor")}
              >
                提供者として登録
              </button>
            </div>
          </Field>
        )}
        <Field label="メールアドレス">
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <Field
          label="パスワード"
          note={
            mode === "signup" ? "10文字以上で設定してください。" : undefined
          }
        >
          <input
            type="password"
            minLength={mode === "signup" ? 10 : 1}
            maxLength={128}
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {mode === "signup" && (
          <>
            <Field
              label="生年月日"
              note="18歳以上の方が登録できます。生年月日は公開しません。"
            >
              <input
                type="date"
                required
                value={birth}
                onChange={(e) => setBirth(e.target.value)}
              />
            </Field>
            <label className="check-row">
              <input
                type="checkbox"
                required
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                <Link href="/terms" target="_blank">
                  利用規約
                </Link>
                と
                <Link href="/privacy" target="_blank">
                  個人情報の取り扱い
                </Link>
                に同意します。
              </span>
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button disabled={busy} className="button full-width">
          {busy ? <LoaderCircle size={17} className="spin" /> : null}
          {mode === "login" ? "ログインする" : "アカウントを作成"}
          <ArrowRight size={17} />
        </button>
      </form>
    </Modal>
  );
}
function AccountModal({ ctx, onClose }: { ctx: Context; onClose: () => void }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  const logout = async () => {
    try {
      await api("auth/logout", "POST", {});
      await ctx.refresh();
      onClose();
      router.push("/");
    } catch (e) {
      ctx.notify((e as Error).message);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      const result = await api("account", "DELETE", { confirm: true });
      await ctx.refresh();
      onClose();
      router.push("/");
      ctx.notify(
        result.pendingFileCleanup
          ? "退会しました。残存ファイルの削除を処理中です。"
          : "退会し、プロフィール・会話・画像を削除しました。",
      );
    } catch (e) {
      ctx.notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="アカウント" onClose={onClose}>
      <div className="account-info">
        <UserRound />
        <div>
          <strong>{ctx.user?.displayId}</strong>
          <p>{ctx.user?.email}</p>
        </div>
      </div>
      <button className="button button-outline full-width" onClick={logout}>
        <LogOut size={17} />
        ログアウト
      </button>
      {ctx.user?.role !== "admin" && (
        <div className="danger-zone">
          <h3>退会・データ削除</h3>
          <p>
            プロフィール、提出情報、会話本文、画像、提供実績を削除します。相手側の会話も閲覧できなくなり、元に戻せません。支払い済みの審査料は返金されません。
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            削除する内容を確認しました
          </label>
          <button
            className="button danger"
            disabled={!confirm || busy}
            onClick={remove}
          >
            <Trash2 size={16} />
            退会してデータを削除
          </button>
        </div>
      )}
    </Modal>
  );
}

function Home({ ctx }: { ctx: Context }) {
  const [donors, setDonors] = useState<Donor[]>([]);
  useEffect(() => {
    api("donors")
      .then((r) => setDonors(r.donors.slice(0, 3)))
      .catch((e) => ctx.notify(e.message));
  }, [ctx.notify]);
  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow">
            <span /> A NEW CHAPTER, YOUR WAY
          </div>
          <h1>
            これからの家族に、
            <br />
            あなたらしい<span className="hero-choice">選択を。</span>
          </h1>
          <p className="hero-description">
            大切な選択だからこそ、情報を確かめて、対話を重ねる。
            <br className="desktop-only" />
            あなたの希望に合う提供者を、あなたのペースで。
          </p>
          <div className="hero-buttons">
            <Link className="button button-large" href="/donors">
              提供者を探す
              <ArrowRight size={19} />
            </Link>
            <a className="hero-guide" href="#guide">
              サービスについて
              <ArrowUpRight size={17} />
            </a>
          </div>
          <div className="hero-reassurance">
            <ShieldCheck size={16} />
            <span>提供者の本人確認</span>
            <span className="divider-dot" />
            <span>希望者の利用は無料</span>
          </div>
        </div>
        <div className="hero-visual">
          <BirdArt />
          <div className="floating-note">
            <span className="floating-icon">
              <Leaf size={19} />
            </span>
            <span>
              ひとつずつ、納得できる選択へ。
              <small>A little hope, a new beginning.</small>
            </span>
          </div>
          <span className="hero-caption">THE NEXT CHAPTER STARTS HERE</span>
        </div>
      </section>
      <section className="trust-strip">
        <div>
          <FileCheck2 />
          <span>
            <strong>確かめられる情報</strong>
            <small>証明書を管理者が目視で確認</small>
          </span>
        </div>
        <div>
          <LockKeyhole />
          <span>
            <strong>あなたが決める公開範囲</strong>
            <small>顔写真・学歴は相手ごとに開示</small>
          </span>
        </div>
        <div>
          <MessageCircle />
          <span>
            <strong>対話からはじまる</strong>
            <small>会話の承認後にサイト内で相談</small>
          </span>
        </div>
      </section>
      <section className="section-shell featured">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FIND YOUR CONNECTION</span>
            <h2>提供者を探してみませんか</h2>
            <p>地域や身体情報、提供条件から、希望に合う方を探せます。</p>
          </div>
          <Link className="text-link" href="/donors">
            すべての提供者を見る
            <ArrowRight size={17} />
          </Link>
        </div>
        <div className="donor-grid home-grid">
          {donors.map((d) => (
            <DonorCard key={d.id} donor={d} />
          ))}
          {!donors.length && (
            <Empty title="提供者の掲載を準備しています">
              審査を通過した提供者がここに表示されます。
            </Empty>
          )}
        </div>
        <p className="section-footnote">
          掲載情報は提供者本人の情報です。子どもの性質や妊娠・出産の結果を保証するものではありません。
        </p>
      </section>
      <section className="guide-section" id="guide">
        <div className="section-shell">
          <div className="section-heading">
            <div>
              <span className="eyebrow">HOW IT WORKS</span>
              <h2>３つのステップで、対話へ</h2>
            </div>
            <p>
              まずは情報を見ることから。
              <br />
              納得できるまで、ゆっくりと。
            </p>
          </div>
          <div className="guide-grid">
            {[
              {
                n: "01",
                icon: <Search />,
                title: "希望に合う方を探す",
                text: "年齢・地域・身体情報や提供条件を確認。検索は登録せずにご利用いただけます。",
              },
              {
                n: "02",
                icon: <MessageCircle />,
                title: "会話を申請する",
                text: "無料の希望者登録後、会話を申請。提供者の承認後に相談できます。",
              },
              {
                n: "03",
                icon: <Heart />,
                title: "情報を確かめ、話し合う",
                text: "必要な情報は相手の許可を得て確認。方法や条件は、双方の合意で決めます。",
              },
            ].map((s) => (
              <article key={s.n}>
                <span className="step-number">{s.n}</span>
                <div className="guide-icon">{s.icon}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="donor-invitation section-shell">
        <div>
          <span className="eyebrow">BECOME A DONOR</span>
          <h2>提供者として、登録をお考えの方へ</h2>
          <p>
            登録審査料は税込5,000円の一回払い。
            <br />
            情報と証明書を提出し、支払い後に管理者が審査します。
          </p>
        </div>
        <Link href="/register" className="button button-outline">
          提供者登録について
          <ArrowUpRight size={18} />
        </Link>
        <Feather className="invitation-feather" size={126} strokeWidth={0.8} />
      </section>
    </>
  );
}
function DonorCard({ donor: d }: { donor: Donor }) {
  const negative = INFECTIONS.every((k) => d.infections[k] === "陰性");
  return (
    <Link href={"/donors/" + d.id} className="donor-card">
      <div className="card-top">
        <div className="donor-avatar">
          <UserRound strokeWidth={1.3} size={29} />
        </div>
        <div>
          <div className="donor-name">
            {d.displayId}
            <span>{d.age}歳</span>
          </div>
          <div className="location">
            <MapPin size={13} />
            {d.residence}
          </div>
        </div>
        <span className="card-arrow">
          <ArrowUpRight size={20} />
        </span>
      </div>
      <div className="card-tags">
        <span className="badge">
          <ShieldCheck size={12} />
          本人確認済み
        </span>
        {d.recentlyActive && <span className="subtle-tag">最近利用あり</span>}
      </div>
      <div className="card-metrics">
        <div>
          <small>身長</small>
          <strong>
            {d.height}
            <span>cm</span>
          </strong>
        </div>
        <div>
          <small>体重</small>
          <strong>
            {d.weight}
            <span>kg</span>
          </strong>
        </div>
        <div>
          <small>血液型</small>
          <strong>
            {d.blood}
            <span>{d.blood !== "不明" ? "型" : ""}</span>
          </strong>
        </div>
      </div>
      <div className="card-extra">
        <span>
          体脂肪率 <b>{d.bodyFat}%</b>
        </span>
        <span>
          筋肉量 <b>{d.muscle}kg</b>
        </span>
      </div>
      <div className="card-conditions">
        <span>
          <CalendarDays size={14} />
          {d.weekdays.join("・")}
        </span>
        <span>
          {d.frequencyPeriod}
          {d.frequency}回
        </span>
      </div>
      <div className="card-bottom">
        <div className="method-tags">
          {d.methods.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
        <span className={negative ? "exam-tag" : "exam-tag muted"}>
          {negative ? "感染症検査の記載あり" : "検査情報を見る"}
        </span>
      </div>
    </Link>
  );
}
function SearchPage({ ctx }: { ctx: Context }) {
  const [filters, setFilters] = useState({
      prefecture: "",
      blood: "",
      method: "",
      weekday: "",
      minAge: "",
      maxAge: "",
      minHeight: "",
      minIq: "",
      infectionVerified: false,
      sort: "recent",
    }),
    [donors, setDonors] = useState<Donor[]>([]),
    [loading, setLoading] = useState(true),
    [showFilters, setShowFilters] = useState(false);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      const q = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v) q.set(k, v === true ? "1" : String(v));
      });
      setLoading(true);
      api("donors?" + q)
        .then((r) => {
          if (alive) setDonors(r.donors);
        })
        .catch((e) => ctx.notify(e.message))
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [filters, ctx.notify]);
  const update = (k: string, v: string | boolean) =>
    setFilters((s) => ({ ...s, [k]: v }));
  const active = Object.entries(filters).filter(
    ([k, v]) => k !== "sort" && v,
  ).length;
  return (
    <div className="page-shell">
      <div className="breadcrumb">
        <Link href="/">トップ</Link>
        <ChevronRight size={12} />
        提供者を探す
      </div>
      <div className="page-heading">
        <span className="eyebrow">FIND A DONOR</span>
        <h1>あなたの希望に合う提供者を。</h1>
        <p>必要な情報を比べながら、納得できる選択を。</p>
      </div>
      <div className="search-layout">
        <aside className={"filter-panel " + (showFilters ? "mobile-open" : "")}>
          <div className="filter-heading">
            <h2>
              <SlidersHorizontal size={17} />
              絞り込み
            </h2>
            <button
              className="text-button"
              onClick={() =>
                setFilters({
                  prefecture: "",
                  blood: "",
                  method: "",
                  weekday: "",
                  minAge: "",
                  maxAge: "",
                  minHeight: "",
                  minIq: "",
                  infectionVerified: false,
                  sort: "recent",
                })
              }
            >
              クリア
            </button>
          </div>
          <Field label="提供可能な都道府県">
            <Select
              value={filters.prefecture}
              onChange={(v) => update("prefecture", v)}
              options={PREFECTURES}
              placeholder="すべての地域"
            />
          </Field>
          <Field label="年齢">
            <div className="range-input">
              <input
                type="number"
                min={18}
                aria-label="最低年齢"
                placeholder="18"
                value={filters.minAge}
                onChange={(e) => update("minAge", e.target.value)}
              />
              <span>〜</span>
              <input
                type="number"
                min={18}
                aria-label="最高年齢"
                placeholder="上限なし"
                value={filters.maxAge}
                onChange={(e) => update("maxAge", e.target.value)}
              />
            </div>
          </Field>
          <Field label="身長">
            <div className="input-unit">
              <input
                type="number"
                aria-label="最低身長"
                placeholder="指定なし"
                value={filters.minHeight}
                onChange={(e) => update("minHeight", e.target.value)}
              />
              <span>cm以上</span>
            </div>
          </Field>
          <Field label="血液型">
            <Select
              value={filters.blood}
              onChange={(v) => update("blood", v)}
              options={BLOOD}
              placeholder="すべて"
            />
          </Field>
          <Field label="提供方法">
            <Select
              value={filters.method}
              onChange={(v) => update("method", v)}
              options={["シリンジ法", "タイミング法"]}
              placeholder="すべて"
            />
          </Field>
          <Field label="提供可能な曜日">
            <Select
              value={filters.weekday}
              onChange={(v) => update("weekday", v)}
              options={WEEKDAYS}
              placeholder="すべて"
            />
          </Field>
          <Field label="IQ（参考値）">
            <input
              type="number"
              aria-label="最低IQ"
              placeholder="指定なし"
              value={filters.minIq}
              onChange={(e) => update("minIq", e.target.value)}
            />
          </Field>
          <label className="check-row">
            <input
              type="checkbox"
              checked={filters.infectionVerified}
              onChange={(e) => update("infectionVerified", e.target.checked)}
            />
            ４項目の陰性結果の記載あり
          </label>
          <p className="tiny muted">
            検査日以降の状態を保証する条件ではありません。地域には交通費が必要な地域も含みます。
          </p>
        </aside>
        <section className="search-results">
          <div className="results-toolbar">
            <div>
              <strong>{loading ? "…" : donors.length}</strong>
              <span>名の提供者</span>
              {active > 0 && <span className="active-count">{active}条件</span>}
            </div>
            <button
              className="button button-outline mobile-filter-button"
              onClick={() => setShowFilters((v) => !v)}
            >
              <SlidersHorizontal size={15} />
              絞り込み
            </button>
            <label className="sort-label">
              並び順
              <select
                value={filters.sort}
                onChange={(e) => update("sort", e.target.value)}
              >
                <option value="recent">最近利用のある方</option>
                <option value="height">身長が高い順</option>
                <option value="age">年齢が低い順</option>
              </select>
            </label>
          </div>
          {loading ? (
            <Busy />
          ) : donors.length ? (
            <div className="donor-grid">
              {donors.map((d) => (
                <DonorCard key={d.id} donor={d} />
              ))}
            </div>
          ) : (
            <Empty
              title="条件に合う提供者が見つかりません"
              icon={<Search size={30} />}
            >
              条件を少し広げて、もう一度お試しください。
            </Empty>
          )}
          <div className="search-note">
            <ShieldCheck size={21} />
            <div>
              <strong>大切な情報は、あなたのペースで確認。</strong>
              <p>
                顔写真や学歴は、提供者が会話相手に許可した場合に開示されます。
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
function ExamDate({ date }: { date: string }) {
  return (
    <span className={"exam-date " + (dateExpired(date) ? "expired" : "")}>
      {date
        ? `${date.replaceAll("-", ".")} ${dateExpired(date) ? "・2年経過" : ""}`
        : "未記載"}
    </span>
  );
}
function DonorPage({ ctx, donorId }: { ctx: Context; donorId: string }) {
  const router = useRouter();
  const [d, setDonor] = useState<Donor | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setDonor(null);
    setError("");
    const load = () =>
      api("donors/" + donorId)
        .then((r) => {
          if (alive) setDonor(r.donor);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    void load();
    const timer = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [donorId, ctx.user?.id]);
  const request = async () => {
    if (!ctx.user) {
      ctx.signIn("recipient");
      return;
    }
    if (ctx.user.role !== "recipient") {
      ctx.notify("会話の申請は希望者アカウントから行えます。");
      return;
    }
    setBusy(true);
    try {
      const r = await api("conversations", "POST", { donorId });
      router.push("/chat?conversation=" + r.conversationId);
    } catch (e) {
      ctx.notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (error)
    return (
      <div className="page-shell">
        <Empty title={error}>
          <Link href="/donors">検索に戻る</Link>
        </Empty>
      </div>
    );
  if (!d) return <Busy />;
  return (
    <div className="page-shell">
      <div className="breadcrumb">
        <Link href="/">トップ</Link>
        <ChevronRight size={12} />
        <Link href="/donors">提供者を探す</Link>
        <ChevronRight size={12} />
        {d.displayId}
      </div>
      <div className="profile-header">
        <div className="profile-avatar">
          <UserRound size={44} strokeWidth={1.2} />
        </div>
        <div>
          <div className="card-tags">
            <span className="badge">
              <ShieldCheck size={13} />
              本人確認済み
            </span>
            {d.recentlyActive && (
              <span className="subtle-tag">最近利用あり</span>
            )}
          </div>
          <h1>
            {d.displayId}
            <span>{d.age}歳</span>
          </h1>
          <p className="location">
            <MapPin size={15} />
            {d.residence}
          </p>
        </div>
        <Link className="text-link profile-back" href="/donors">
          <ArrowLeft size={15} />
          検索に戻る
        </Link>
      </div>
      <div className="profile-layout">
        <div className="profile-main">
          <section className="panel">
            <div className="panel-heading">
              <h2>
                <UserRound size={18} />
                基本情報
              </h2>
              <span className="tiny muted">
                身体情報の測定日 <ExamDate date={d.bodyDate} />
              </span>
            </div>
            <div className="profile-metrics">
              {[
                ["身長", d.height, "cm"],
                ["体重", d.weight, "kg"],
                ["体脂肪率", d.bodyFat, "%"],
                ["推定筋肉量", d.muscle, "kg"],
              ].map(([label, n, unit]) => (
                <div key={String(label)}>
                  <small>{label}</small>
                  <strong>{value(Number(n), String(unit))}</strong>
                </div>
              ))}
            </div>
            <dl className="definition-list">
              <div>
                <dt>髪色</dt>
                <dd>{d.hair}</dd>
              </div>
              <div>
                <dt>血液型</dt>
                <dd>
                  {d.blood}
                  {d.blood !== "不明" ? "型" : ""}
                </dd>
              </div>
              <div>
                <dt>IQ（参考値）</dt>
                <dd>{value(d.iq)}</dd>
              </div>
            </dl>
            <p className="tiny muted">
              IQは、公的なIQ検査結果や学歴から換算した参考値です。
            </p>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>
                <CalendarDays size={18} />
                提供条件
              </h2>
            </div>
            <dl className="definition-list">
              <div>
                <dt>提供方法</dt>
                <dd>
                  <div className="method-tags">
                    {d.methods.map((m) => (
                      <span key={m}>{m}</span>
                    ))}
                  </div>
                </dd>
              </div>
              <div>
                <dt>提供頻度</dt>
                <dd>
                  {d.frequencyPeriod}
                  {d.frequency}回
                  {d.extraFrequency > 0 && (
                    <small> 居住地近くであれば＋{d.extraFrequency}回</small>
                  )}
                </dd>
              </div>
              <div>
                <dt>提供可能な曜日</dt>
                <dd>{d.weekdays.join("・")}</dd>
              </div>
              <div>
                <dt>通常提供可能地域</dt>
                <dd>
                  <div className="region-tags">
                    {d.normalRegions.map((r) => (
                      <span key={r.prefecture + r.area}>
                        {r.prefecture} · {r.area}
                      </span>
                    ))}
                    {!d.normalRegions.length && "なし"}
                  </div>
                </dd>
              </div>
              <div>
                <dt>交通費が必要な地域</dt>
                <dd>
                  <div className="region-tags travel">
                    {d.travelRegions.map((r) => (
                      <span key={r.prefecture + r.area}>
                        {r.prefecture} · {r.area}
                      </span>
                    ))}
                    {!d.travelRegions.length && "なし"}
                  </div>
                </dd>
              </div>
              <div>
                <dt>提供後の連絡</dt>
                <dd>{d.contactPolicy}</dd>
              </div>
              <div>
                <dt>将来の情報提供</dt>
                <dd>{d.futureInfo}</dd>
              </div>
            </dl>
            <p className="tiny muted">
              「中心部」「居住地近く」は提供者の判断によります。具体的な場所・費用・条件は会話で確認してください。謝礼の取り決めに運営は関与しません。
            </p>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>
                <FileCheck2 size={18} />
                精液検査の結果
              </h2>
              <ExamDate date={d.semenDate} />
            </div>
            <div className="lab-grid">
              {SEMEN_FIELDS.map((f) => (
                <div key={f.key}>
                  <span>{f.label}</span>
                  <strong>{value(d.semen[f.key], f.unit)}</strong>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>
                <ShieldCheck size={18} />
                感染症検査
              </h2>
              <ExamDate date={d.infectionDate} />
            </div>
            <div className="lab-grid infection-grid">
              {INFECTIONS.map((k) => (
                <div key={k}>
                  <span>{k}</span>
                  <strong
                    className={
                      d.infections[k] === "陰性" ? "negative-result" : ""
                    }
                  >
                    {d.infections[k] === "未検査・未提出" ? (
                      <span className="nodata">NoData</span>
                    ) : (
                      d.infections[k]
                    )}
                  </strong>
                </div>
              ))}
            </div>
            <p className="tiny muted">
              任意提出項目です。掲載内容は検査当時の結果であり、現在の状態を保証しません。
            </p>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>
                <Heart size={18} />
                健康・生活習慣
              </h2>
              <ExamDate date={d.healthDate} />
            </div>
            <dl className="definition-list">
              {[
                [
                  "血圧",
                  d.systolic !== null && d.diastolic !== null
                    ? `${d.systolic} / ${d.diastolic} mmHg`
                    : "NoData",
                ],
                ["喫煙", d.smoking],
                ["飲酒", d.drinking],
                ["運動", d.exercise],
                ["既往歴", d.history],
                ["遺伝性疾患", d.hereditary],
                ["アレルギー", d.allergy],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="tiny muted">
              既往歴・生活習慣等は本人の申告です。「あり」の詳細は会話で確認してください。
            </p>
          </section>
          <section className="panel private-panel">
            <div className="panel-heading">
              <h2>
                <LockKeyhole size={18} />
                顔写真・学歴
              </h2>
              <span className="badge">個別開示</span>
            </div>
            {ctx.user && d.privateInfo ? (
              <>
                <p className="private-approved">
                  <CheckCircle2 size={17} />
                  この情報の閲覧が許可されています。
                </p>
                {d.privateInfo.photoId ? (
                  <img
                    className="private-photo"
                    alt="提供者が開示した顔写真"
                    src={"/api/files/" + d.privateInfo.photoId}
                  />
                ) : (
                  <p className="muted">顔写真は未登録です。</p>
                )}
                {d.privateInfo.academics
                  .filter((a) => a.kind !== "wais")
                  .map((a) => (
                    <dl className="definition-list" key={a.kind}>
                      <div>
                        <dt>{a.kind === "highschool" ? "高校" : "大学"}</dt>
                        <dd>
                          {a.school} {a.faculty} {a.department}
                        </dd>
                      </div>
                    </dl>
                  ))}
              </>
            ) : (
              <div className="private-placeholder">
                <LockKeyhole size={25} />
                <div>
                  <strong>提供者の許可後に閲覧できます</strong>
                  <p>会話を通じて、必要な情報の開示を相談してください。</p>
                </div>
              </div>
            )}
          </section>
        </div>
        <aside className="profile-sidebar">
          <div className="contact-card">
            <span className="eyebrow">START A CONVERSATION</span>
            <h2>まずは、対話から。</h2>
            <p>
              提供者の承認後に、
              <br />
              サイト内チャットで相談できます。
            </p>
            {ctx.user?.id === d.id ? (
              <Link href="/register" className="button full-width">
                登録情報を管理する
              </Link>
            ) : (
              <button
                disabled={busy}
                onClick={request}
                className="button full-width"
              >
                <MessageCircle size={17} />
                会話を申請する
                <ArrowRight size={16} />
              </button>
            )}
            <small>希望者の登録・利用は無料です</small>
            <div className="sidebar-divider" />
            <div className="sidebar-point">
              <ShieldCheck size={16} />
              提供者による会話承認制
            </div>
            <div className="sidebar-point">
              <LockKeyhole size={16} />
              情報は許可された相手に開示
            </div>
            <div className="sidebar-point">
              <Eye size={16} />
              管理者は会話を閲覧可能
            </div>
          </div>
          <div className="panel small-panel">
            <h3>確認済みの提供実績</h3>
            <div className="experience-counts">
              <div>
                <strong>{d.donationCount}</strong>
                <span>提供</span>
              </div>
              <div>
                <strong>{d.birthCount}</strong>
                <span>出生報告</span>
              </div>
            </div>
            <p className="tiny muted">
              利用者間で確認された記録です。医学的な実績認定ではありません。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function RegionEditor({
  label,
  regions,
  onChange,
}: {
  label: string;
  regions: ProfileData["normalRegions"];
  onChange: (v: ProfileData["normalRegions"]) => void;
}) {
  const [pref, setPref] = useState("東京都"),
    [area, setArea] = useState<"全域" | "中心部">("全域");
  return (
    <div className="field">
      <span>{label}</span>
      <div className="region-add">
        <Select options={PREFECTURES} value={pref} onChange={setPref} />
        <Select
          options={["全域", "中心部"]}
          value={area}
          onChange={(s) => setArea(s as "全域" | "中心部")}
        />
        <button
          type="button"
          className="button button-outline button-small"
          onClick={() => {
            if (!regions.some((r) => r.prefecture === pref && r.area === area))
              onChange([...regions, { prefecture: pref, area }]);
          }}
        >
          追加
        </button>
      </div>
      <div className="region-tags editable">
        {regions.map((r) => (
          <span key={r.prefecture + r.area}>
            {r.prefecture} · {r.area}
            <button
              aria-label={r.prefecture + r.area + "を削除"}
              onClick={() => onChange(regions.filter((x) => x !== r))}
            >
              <X size={13} />
            </button>
          </span>
        ))}
      </div>
      {!regions.length && <small>地域はまだ指定されていません。</small>}
    </div>
  );
}
function AcademicEditor({
  academic: a,
  onChange,
}: {
  academic: Academic;
  onChange: (v: Academic) => void;
}) {
  const [query, setQuery] = useState(""),
    [entries, setEntries] = useState<any[]>([]);
  useEffect(() => {
    if (a.kind === "wais") return;
    let active = true;
    const timer = setTimeout(
      () =>
        api("catalog?kind=" + a.kind + "&q=" + encodeURIComponent(query))
          .then((r) => {
            if (active) setEntries(r.entries);
          })
          .catch(() => {}),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, a.kind]);
  if (a.kind === "wais")
    return (
      <Field
        label="WAIS 全検査IQ"
        required
        note="WAISの結果書類を添付してください。他の検査は対象外です。"
      >
        <input
          type="number"
          min={40}
          max={200}
          value={a.iq ?? ""}
          onChange={(e) =>
            onChange({
              ...a,
              iq: e.target.value === "" ? null : Number(e.target.value),
            })
          }
        />
      </Field>
    );
  const manual = (field: string, v: string) =>
    onChange({ ...a, [field]: v, catalogId: "", deviation: undefined });
  return (
    <div className="academic-editor">
      <Field
        label="掲載データから学校・学科を検索"
        note="現在掲載されている年度のデータを使用します。検索欄の文字は公開されません。"
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="学校名・学科名で検索"
        />
      </Field>
      {entries.length > 0 && (
        <Field label="学校・学科を選択">
          <select
            value={a.catalogId}
            onChange={(e) => {
              const entry = entries.find((x) => x.id === e.target.value);
              if (entry)
                onChange({
                  ...a,
                  catalogId: entry.id,
                  school: entry.school,
                  faculty: entry.faculty,
                  department: entry.department,
                  deviation: entry.deviation,
                  year: entry.year,
                });
            }}
          >
            <option value="">選択してください</option>
            {entries.map((e) => (
              <option key={e.id} value={e.id}>
                {e.school} {e.faculty} {e.department}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="form-grid">
        <Field label="学校名" required>
          <input
            value={a.school}
            onChange={(e) => manual("school", e.target.value)}
            maxLength={120}
            placeholder="卒業証明書と同じ名称"
          />
        </Field>
        {a.kind === "university" && (
          <Field label="学部" required>
            <input
              value={a.faculty}
              onChange={(e) => manual("faculty", e.target.value)}
              maxLength={120}
            />
          </Field>
        )}
        <Field label="学科・コース" required>
          <input
            value={a.department}
            onChange={(e) => manual("department", e.target.value)}
            maxLength={120}
          />
        </Field>
      </div>
      <p className="tiny muted">
        一覧にない学校は、名称を指定して書類を提出できます。偏差値は管理者が指定サイトで照合します。卒業前・中退・海外校は対象外です。学校名は個別開示まで非公開です。
      </p>
    </div>
  );
}
function Registration({ ctx }: { ctx: Context }) {
  const params = useSearchParams();
  const [p, setProfile] = useState<ProfileData>(emptyProfile),
    [approved, setApproved] = useState<ProfileData | null>(null),
    [status, setStatus] = useState("draft"),
    [docs, setDocs] = useState<FileInfo[]>([]),
    [applications, setApplications] = useState<any[]>([]),
    [photo, setPhoto] = useState<string | null>(null),
    [step, setStep] = useState(0),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(""),
    [agreed, setAgreed] = useState(false);
  const owner = ctx.user?.role === "donor" ? ctx.user.id : null;
  const load = useCallback(
    async (reset = false) => {
      if (!owner) return;
      try {
        const r = await api("profile");
        if (reset) {
          setProfile(r.profile);
          setDocs(r.documents);
          setPhoto(r.photoId);
        }
        setStatus(r.status);
        setApproved(r.approved);
        setApplications(r.applications);
      } catch (e) {
        ctx.notify((e as Error).message);
      }
    },
    [owner, ctx.notify],
  );
  useEffect(() => {
    if (!owner) return;
    setLoading(true);
    void load(true).finally(() => setLoading(false));
    const timer = setInterval(() => load(false), 10000);
    return () => clearInterval(timer);
  }, [owner, load]);
  const captureOnce = useRef("");
  useEffect(() => {
    const application = params.get("application");
    if (
      !owner ||
      !application ||
      !params.get("token") ||
      captureOnce.current === application
    )
      return;
    captureOnce.current = application;
    api("payments/" + application + "/capture", "POST", {})
      .then(() => {
        ctx.notify("支払いを確認しました。審査待ちになりました。");
        void load(false);
      })
      .catch((e) => ctx.notify(e.message));
  }, [params, owner, load, ctx.notify]);
  const set = (key: keyof ProfileData, v: any) =>
    setProfile((old) => ({ ...old, [key]: v }));
  const attachment = async (file: File, kind: string) => {
    setUploading(kind);
    try {
      const f = await upload(file, kind);
      if (kind === "photo") setPhoto(f.id);
      else setDocs((old) => [...old, f]);
      ctx.notify("ファイルを非公開で保存しました。");
    } catch (e) {
      ctx.notify((e as Error).message);
    } finally {
      setUploading("");
    }
  };
  const save = async (publish = false) => {
    setBusy(true);
    try {
      await api("profile", "PATCH", { profile: p, publish });
      ctx.notify(
        publish ? "提供条件を更新しました。" : "入力内容を保存しました。",
      );
      void load(false);
    } catch (e) {
      ctx.notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (!agreed) {
      ctx.notify("審査料と公開範囲を確認してください。");
      return;
    }
    setBusy(true);
    try {
      const revision = applications.find((a) => a.status === "needs_changes");
      if (revision) {
        await api("applications/" + revision.id + "/revise", "POST", {
          profile: p,
          fileIds: docs.map((f) => f.id),
        });
        ctx.notify("修正内容を再提出しました。追加料金はありません。");
      } else {
        await api("applications", "POST", {
          profile: p,
          fileIds: docs.map((f) => f.id),
        });
        ctx.notify(
          "申請を保存しました。支払いを完了すると審査対象になります。",
        );
      }
      setDocs([]);
      await load(false);
    } catch (e) {
      ctx.notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const pay = async (a: any, action: string) => {
    setBusy(true);
    try {
      const r = await api("payments/" + a.id + "/" + action, "POST", {});
      if (r.approveUrl) window.location.assign(r.approveUrl);
      else {
        ctx.notify(
          ctx.paymentMode === "demo"
            ? "デモ支払いを確認しました。実際の課金はありません。"
            : "支払いを確認しました。",
        );
        await load(false);
      }
    } catch (e) {
      ctx.notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const documentInput = (kind: string, required = false) => {
    const files = docs.filter((f) => f.kind === kind);
    return (
      <div className="document-upload" key={kind}>
        <div>
          <FileText size={19} />
          <span>
            {DOC_LABELS[kind]}
            {required && <b className="required">必須</b>}
          </span>
        </div>
        {files.map((f) => (
          <div className="uploaded-file" key={f.id}>
            <a href={"/api/files/" + f.id} target="_blank" rel="noreferrer">
              <FileCheck2 size={14} />
              {f.original_name}
            </a>
            <button
              className="icon-button"
              aria-label="提出前の書類を削除"
              onClick={async () => {
                try {
                  await api("files/" + f.id, "DELETE");
                  setDocs((old) => old.filter((x) => x.id !== f.id));
                } catch (e) {
                  ctx.notify((e as Error).message);
                }
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <label className="upload-button">
          {uploading === kind ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <Upload size={15} />
          )}
          書類を選択
          <input
            type="file"
            disabled={!!uploading || !owner}
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => {
              const input = e.currentTarget;
              const f = input.files?.[0];
              if (f) void attachment(f, kind);
              input.value = "";
            }}
          />
        </label>
      </div>
    );
  };
  if (ctx.user && ctx.user.role !== "donor")
    return (
      <div className="page-shell">
        <Empty
          title="提供者アカウントでご利用ください"
          icon={<UserRound size={32} />}
        >
          提供者登録は提供者アカウントから行います。
          {ctx.demo && (
            <>
              <br />
              上部の「提供者で試す」から操作できます。
            </>
          )}
        </Empty>
      </div>
    );
  const pending = applications.find((a) =>
    ["payment_pending", "queued", "reviewing"].includes(a.status),
  );
  return (
    <div className="page-shell registration-shell">
      <div className="breadcrumb">
        <Link href="/">トップ</Link>
        <ChevronRight size={12} />
        提供者登録
      </div>
      <div className="page-heading">
        <span className="eyebrow">BECOME A DONOR</span>
        <h1>{approved ? "登録情報を管理する" : "提供者として、登録する。"}</h1>
        <p>情報はひとつずつ確認し、公開します。顔写真・学歴は個別開示です。</p>
      </div>
      {!ctx.user && (
        <div className="registration-intro">
          <div>
            <ShieldCheck size={27} />
            <h2>はじめにアカウントを作成してください</h2>
            <p>
              18歳以上の方が登録できます。登録審査料は税込5,000円。
              <br />
              身分証明書、学歴またはWAIS、体組成と精液検査の証明を準備してください。
            </p>
          </div>
          <button className="button" onClick={() => ctx.signIn("donor")}>
            提供者アカウントを作成
            <ArrowRight size={17} />
          </button>
        </div>
      )}
      {loading ? (
        <Busy />
      ) : (
        <>
          {approved && (
            <div className="status-banner">
              <div>
                <CheckCircle2 size={21} />
                <span>
                  掲載状態：<strong>{STATE_LABELS[status] || status}</strong>
                </span>
              </div>
              <button
                className="button button-outline button-small"
                disabled={status === "suspended"}
                onClick={async () => {
                  try {
                    await api("profile/availability", "POST", {
                      paused: status !== "paused",
                    });
                    await load(false);
                  } catch (e) {
                    ctx.notify((e as Error).message);
                  }
                }}
              >
                {status === "paused" ? (
                  <>
                    <Play size={14} />
                    募集を再開
                  </>
                ) : (
                  <>
                    <Pause size={14} />
                    募集を休止
                  </>
                )}
              </button>
            </div>
          )}
          {pending && (
            <div className="panel payment-panel">
              <div>
                <span className="badge">{STATE_LABELS[pending.status]}</span>
                <h2>
                  {pending.kind === "initial" ? "登録審査" : "証明書更新審査"}
                </h2>
                <p>
                  {pending.status === "payment_pending"
                    ? "支払い完了後に審査を開始します。掲載の承認は保証されません。"
                    : "支払いを確認しています。管理者の審査をお待ちください。"}
                </p>
              </div>
              {pending.status === "payment_pending" && (
                <div className="payment-actions">
                  <strong>
                    ¥5,000<small>税込・一括</small>
                  </strong>
                  {ctx.demo && ctx.paymentMode === "demo" ? (
                    <button
                      disabled={busy}
                      className="button"
                      onClick={() => pay(pending, "demo")}
                    >
                      デモ支払いを完了（課金なし）
                    </button>
                  ) : (
                    <>
                      <button
                        disabled={busy}
                        className="button"
                        onClick={() => pay(pending, "create")}
                      >
                        <CreditCard size={16} />
                        PayPalで支払う
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => pay(pending, "capture")}
                      >
                        支払い完了を再確認
                      </button>
                    </>
                  )}
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await api("applications/" + pending.id, "DELETE");
                        await load(true);
                        ctx.notify("決済手続き開始前の申請を取り消しました。");
                      } catch (e) {
                        ctx.notify((e as Error).message);
                      }
                    }}
                  >
                    未払い申請を取り消す
                  </button>
                </div>
              )}
            </div>
          )}
          {applications.some((a) => a.status === "needs_changes") && (
            <div className="notice">
              <AlertCircle size={20} />
              <div>
                <strong>入力・書類の修正が必要です</strong>
                <p>
                  {
                    applications.find((a) => a.status === "needs_changes")
                      ?.review_reason
                  }
                  。修正して再提出してください。同じ申請内では追加料金はかかりません。
                </p>
              </div>
            </div>
          )}
          <div className="registration-layout">
            <aside className="registration-steps">
              {["基本情報", "検査・証明書", "提供条件", "確認・申請"].map(
                (label, i) => (
                  <button
                    key={label}
                    className={
                      step === i ? "active" : step > i ? "completed" : ""
                    }
                    onClick={() => setStep(i)}
                  >
                    <span>
                      {step > i ? (
                        <Check size={15} />
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </span>
                    <div>{label}</div>
                  </button>
                ),
              )}
              <div className="registration-fee">
                <small>登録・証明書更新の審査料</small>
                <strong>
                  ¥5,000<span>税込</span>
                </strong>
                <p>
                  同時に提出する更新書類は一括料金です。審査開始前の支払いが必要です。
                </p>
              </div>
            </aside>
            <div className="registration-form">
              <div className="panel">
                <div className="panel-heading">
                  <h2>
                    {
                      [
                        "基本情報",
                        "検査と証明書",
                        "提供条件",
                        "公開範囲と審査料の確認",
                      ][step]
                    }
                  </h2>
                  <span className="tiny muted">STEP {step + 1} / 4</span>
                </div>
                {step === 0 && (
                  <>
                    <div className="form-grid">
                      <Field label="身長" required>
                        <div className="input-unit">
                          <input
                            type="number"
                            min={100}
                            max={250}
                            value={p.height}
                            onChange={(e) =>
                              set("height", Number(e.target.value))
                            }
                          />
                          <span>cm</span>
                        </div>
                      </Field>
                      <Field label="体重" required>
                        <div className="input-unit">
                          <input
                            type="number"
                            step="0.1"
                            value={p.weight}
                            onChange={(e) =>
                              set("weight", Number(e.target.value))
                            }
                          />
                          <span>kg</span>
                        </div>
                      </Field>
                      <Field label="体脂肪率" required>
                        <div className="input-unit">
                          <input
                            type="number"
                            step="0.1"
                            value={p.bodyFat}
                            onChange={(e) =>
                              set("bodyFat", Number(e.target.value))
                            }
                          />
                          <span>%</span>
                        </div>
                      </Field>
                      <Field label="推定筋肉量" required>
                        <div className="input-unit">
                          <input
                            type="number"
                            step="0.1"
                            value={p.muscle}
                            onChange={(e) =>
                              set("muscle", Number(e.target.value))
                            }
                          />
                          <span>kg</span>
                        </div>
                      </Field>
                      <Field label="体組成の測定日" required>
                        <input
                          type="date"
                          value={p.bodyDate}
                          onChange={(e) => set("bodyDate", e.target.value)}
                        />
                      </Field>
                      <Field label="髪色">
                        <Select
                          value={p.hair}
                          onChange={(v) => set("hair", v)}
                          options={HAIR}
                        />
                      </Field>
                      <Field label="血液型">
                        <Select
                          value={p.blood}
                          onChange={(v) => set("blood", v)}
                          options={BLOOD}
                        />
                      </Field>
                      <Field label="居住都道府県">
                        <Select
                          value={p.residence}
                          onChange={(v) => set("residence", v)}
                          options={PREFECTURES}
                        />
                      </Field>
                    </div>
                    <div className="form-divider" />
                    <h3>
                      学歴・WAISの証明 <b className="required">最低1つ</b>
                    </h3>
                    <p className="muted small-text">
                      高校卒業・大学卒業・WAISから選択してください。資料に基づく最高値をIQの参考値として表示します。
                    </p>
                    <Chips
                      options={["高校", "大学", "WAIS"]}
                      selected={p.academics.map(
                        (a) =>
                          ({
                            highschool: "高校",
                            university: "大学",
                            wais: "WAIS",
                          })[a.kind],
                      )}
                      onChange={(vs) =>
                        set(
                          "academics",
                          vs.map((s) => {
                            const kind = (
                              {
                                高校: "highschool",
                                大学: "university",
                                WAIS: "wais",
                              } as const
                            )[s as "高校" | "大学" | "WAIS"];
                            return (
                              p.academics.find((a) => a.kind === kind) || {
                                kind,
                                catalogId: "",
                                school: "",
                                faculty: "",
                                department: "",
                                iq: null,
                              }
                            );
                          }),
                        )
                      }
                    />
                    {p.academics.map((a, i) => (
                      <div className="academic-block" key={a.kind}>
                        <h4>
                          {a.kind === "highschool"
                            ? "高校"
                            : a.kind === "university"
                              ? "大学"
                              : "WAIS"}
                        </h4>
                        <AcademicEditor
                          academic={a}
                          onChange={(v) =>
                            set(
                              "academics",
                              p.academics.map((x, j) => (i === j ? v : x)),
                            )
                          }
                        />
                      </div>
                    ))}
                    <div className="form-divider" />
                    <h3>
                      顔写真 <span className="optional">任意・個別開示</span>
                    </h3>
                    <p className="muted small-text">
                      一般公開されません。許可した会話相手だけが閲覧できます。
                    </p>
                    {photo && (
                      <div className="photo-preview">
                        <img
                          src={"/api/files/" + photo}
                          alt="登録した非公開の顔写真"
                        />
                        <button
                          className="text-button"
                          onClick={async () => {
                            try {
                              await api("files/" + photo, "DELETE");
                              setPhoto(null);
                            } catch (e) {
                              ctx.notify((e as Error).message);
                            }
                          }}
                        >
                          削除
                        </button>
                      </div>
                    )}
                    <label className="upload-button">
                      <ImagePlus size={16} />
                      顔写真を選択
                      <input
                        type="file"
                        disabled={!owner || !!uploading}
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => {
                          const input = e.currentTarget;
                          const f = input.files?.[0];
                          if (f) void attachment(f, "photo");
                          input.value = "";
                        }}
                      />
                    </label>
                  </>
                )}
                {step === 1 && (
                  <>
                    <div className="notice">
                      <LockKeyhole size={20} />
                      <p>
                        証明書は管理者と本人だけが閲覧できます。審査終了後、原本ファイルを削除します。更新で変更しない確認済み情報の書類は再提出不要です。
                      </p>
                    </div>
                    {!approved && documentInput("identity", true)}
                    {documentInput("body", !approved)}
                    {p.academics.map((a) => documentInput(a.kind, !approved))}
                    <div className="form-divider" />
                    <h3>精液検査</h3>
                    <Field label="検査日" required>
                      <input
                        type="date"
                        value={p.semenDate}
                        onChange={(e) => set("semenDate", e.target.value)}
                      />
                    </Field>
                    <div className="form-grid">
                      {SEMEN_FIELDS.map((f) => (
                        <Field key={f.key} label={f.label}>
                          <div className="input-unit">
                            <input
                              type="number"
                              step="0.1"
                              min={0}
                              value={p.semen[f.key] ?? ""}
                              placeholder="未記載はNoData"
                              onChange={(e) =>
                                set("semen", {
                                  ...p.semen,
                                  [f.key]:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                })
                              }
                            />
                            <span>{f.unit}</span>
                          </div>
                        </Field>
                      ))}
                    </div>
                    {documentInput("semen", !approved)}
                    <div className="form-divider" />
                    <h3>
                      感染症検査 <span className="optional">任意</span>
                    </h3>
                    <Field label="検査日">
                      <input
                        type="date"
                        value={p.infectionDate}
                        onChange={(e) => set("infectionDate", e.target.value)}
                      />
                    </Field>
                    <div className="form-grid">
                      {INFECTIONS.map((k) => (
                        <Field key={k} label={k}>
                          <Select
                            value={p.infections[k]}
                            onChange={(v) =>
                              set("infections", { ...p.infections, [k]: v })
                            }
                            options={[
                              "未検査・未提出",
                              "陰性",
                              "陽性",
                              "判定保留",
                            ]}
                          />
                        </Field>
                      ))}
                    </div>
                    {Object.values(p.infections).some(
                      (x) => x !== "未検査・未提出",
                    ) && documentInput("infection")}
                    <div className="form-divider" />
                    <h3>
                      健康・生活習慣 <span className="optional">一般公開</span>
                    </h3>
                    <div className="form-grid">
                      <Field label="健康診断日">
                        <input
                          type="date"
                          value={p.healthDate}
                          onChange={(e) => set("healthDate", e.target.value)}
                        />
                      </Field>
                      <Field label="血圧（収縮期 / 拡張期）">
                        <div className="range-input">
                          <input
                            aria-label="収縮期血圧"
                            type="number"
                            placeholder="未記載"
                            value={p.systolic ?? ""}
                            onChange={(e) =>
                              set(
                                "systolic",
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                              )
                            }
                          />
                          <span>/</span>
                          <input
                            aria-label="拡張期血圧"
                            type="number"
                            placeholder="未記載"
                            value={p.diastolic ?? ""}
                            onChange={(e) =>
                              set(
                                "diastolic",
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                              )
                            }
                          />
                        </div>
                      </Field>
                      <Field label="喫煙">
                        <Select
                          value={p.smoking}
                          onChange={(v) => set("smoking", v)}
                          options={[
                            "未回答",
                            "吸わない",
                            "過去に喫煙",
                            "喫煙中",
                          ]}
                        />
                      </Field>
                      <Field label="飲酒頻度">
                        <Select
                          value={p.drinking}
                          onChange={(v) => set("drinking", v)}
                          options={[
                            "未回答",
                            "飲まない",
                            "月に数回",
                            "週1〜2日",
                            "週3〜4日",
                            "ほぼ毎日",
                          ]}
                        />
                      </Field>
                      <Field label="運動頻度">
                        <Select
                          value={p.exercise}
                          onChange={(v) => set("exercise", v)}
                          options={[
                            "未回答",
                            "ほぼなし",
                            "週1〜2日",
                            "週3〜4日",
                            "週5日以上",
                          ]}
                        />
                      </Field>
                      {(
                        [
                          ["history", "既往歴"],
                          ["hereditary", "遺伝性疾患"],
                          ["allergy", "アレルギー"],
                        ] as const
                      ).map(([k, label]) => (
                        <Field label={label} key={k}>
                          <Select
                            value={p[k]}
                            onChange={(v) => set(k, v)}
                            options={["未回答", "なし", "あり", "不明"]}
                          />
                        </Field>
                      ))}
                    </div>
                    {(p.systolic !== null || p.diastolic !== null) &&
                      documentInput("health")}
                  </>
                )}
                {step === 2 && (
                  <>
                    <Field label="提供方法" required>
                      <Chips
                        options={["シリンジ法", "タイミング法"]}
                        selected={p.methods}
                        onChange={(v) => set("methods", v)}
                      />
                    </Field>
                    <div className="form-grid">
                      <Field label="提供頻度" required>
                        <div className="frequency-input">
                          <Select
                            value={p.frequencyPeriod}
                            onChange={(v) => set("frequencyPeriod", v)}
                            options={["月", "年"]}
                          />
                          <input
                            aria-label="提供回数"
                            type="number"
                            min={1}
                            value={p.frequency}
                            onChange={(e) =>
                              set("frequency", Number(e.target.value))
                            }
                          />
                          <span>回</span>
                        </div>
                      </Field>
                      <Field
                        label="居住地近くの場合の追加回数"
                        note="同じ期間内の追加回数。不要なら0。"
                      >
                        <div className="input-unit">
                          <input
                            type="number"
                            min={0}
                            value={p.extraFrequency}
                            onChange={(e) =>
                              set("extraFrequency", Number(e.target.value))
                            }
                          />
                          <span>回</span>
                        </div>
                      </Field>
                    </div>
                    <Field label="可能な曜日" required>
                      <Chips
                        options={WEEKDAYS}
                        selected={p.weekdays}
                        onChange={(v) => set("weekdays", v)}
                      />
                    </Field>
                    <div className="form-divider" />
                    <RegionEditor
                      label="通常提供可能地域"
                      regions={p.normalRegions}
                      onChange={(v) => set("normalRegions", v)}
                    />
                    <RegionEditor
                      label="交通費が必要な地域"
                      regions={p.travelRegions}
                      onChange={(v) => set("travelRegions", v)}
                    />
                    <p className="tiny muted">
                      地域の重複指定は可能です。「中心部」は本人の判断によります。交通費・謝礼等の具体的条件はチャットで相談してください。
                    </p>
                    <div className="form-divider" />
                    <div className="form-grid">
                      <Field label="提供後の連絡">
                        <Select
                          value={p.contactPolicy}
                          onChange={(v) => set("contactPolicy", v)}
                          options={[
                            "提供時のみ",
                            "妊娠結果まで",
                            "出産後も相談可",
                          ]}
                        />
                      </Field>
                      <Field label="子どもへの将来の情報提供">
                        <Select
                          value={p.futureInfo}
                          onChange={(v) => set("futureInfo", v)}
                          options={["対応可", "相談可", "対応不可"]}
                        />
                      </Field>
                    </div>
                    <p className="tiny muted">
                      退会後はサイト内の情報を削除します。将来の連絡方法や必要な情報の保管は、当事者間で取り決めてください。
                    </p>
                  </>
                )}
                {step === 3 && (
                  <>
                    <div className="review-summary">
                      <div>
                        <FileCheck2 size={29} />
                        <span>
                          {approved ? "証明書更新審査" : "提供者登録審査"}
                        </span>
                        <strong>
                          ¥5,000<small>税込</small>
                        </strong>
                      </div>
                      <p>
                        同時に提出する書類は一括料金です。支払い完了後に審査を開始します。不承認・自己都合退会による返金はありません。同一申請の差し戻し修正に追加料金はかかりません。
                      </p>
                    </div>
                    <dl className="definition-list">
                      <div>
                        <dt>一般公開</dt>
                        <dd>
                          年齢・身体情報・血液型・IQの参考値・検査結果・健康情報・提供条件・確認済み実績
                        </dd>
                      </div>
                      <div>
                        <dt>相手ごとの許可後に開示</dt>
                        <dd>顔写真・学校名・学部・学科</dd>
                      </div>
                      <div>
                        <dt>管理者のみ確認</dt>
                        <dd>
                          本人確認書類・証明書。審査終了後に原本を削除します。
                        </dd>
                      </div>
                    </dl>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                      />
                      <span>
                        公開範囲、審査料、
                        <Link href="/terms" target="_blank">
                          利用規約
                        </Link>
                        を確認しました。
                      </span>
                    </label>
                    <button
                      className="button full-width"
                      disabled={
                        !owner || busy || !!pending || !agreed || !!uploading
                      }
                      onClick={submit}
                    >
                      {busy ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <FileCheck2 size={17} />
                      )}{" "}
                      {applications.some((a) => a.status === "needs_changes")
                        ? "修正して再提出（追加料金なし）"
                        : "申請して支払いへ"}
                      <ArrowRight size={17} />
                    </button>
                    {approved && (
                      <button
                        className="button button-outline full-width free-update"
                        disabled={busy || !owner}
                        onClick={() => save(true)}
                      >
                        提供条件だけを更新する（無料）
                      </button>
                    )}
                    <p className="tiny muted">
                      学校名の指定を除き、プロフィールの自由記述欄はありません。入力内容に虚偽がある場合、掲載を停止することがあります。
                    </p>
                  </>
                )}
                <div className="form-navigation">
                  <button
                    className="text-button"
                    disabled={step === 0}
                    onClick={() => setStep((n) => n - 1)}
                  >
                    <ArrowLeft size={16} />
                    前へ
                  </button>
                  {owner && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => save(false)}
                    >
                      入力内容を保存
                    </button>
                  )}
                  {step < 3 && (
                    <button
                      className="button button-small"
                      onClick={() => setStep((n) => n + 1)}
                    >
                      次へ
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          {applications.length > 0 && (
            <section className="panel application-history">
              <div className="panel-heading">
                <h2>
                  <Clock3 size={18} />
                  申請履歴
                </h2>
              </div>
              {applications.map((a) => (
                <div className="history-row" key={a.id}>
                  <span>
                    {a.kind === "initial" ? "登録審査" : "証明書更新"}
                  </span>
                  <span>
                    {new Date(a.created_at).toLocaleDateString("ja-JP", {
                      timeZone: "Asia/Tokyo",
                    })}
                  </span>
                  <span className="badge neutral">
                    {STATE_LABELS[a.status]}
                  </span>
                  <small>{a.paid ? "支払い済み" : "未払い"}</small>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ChatPage({ ctx }: { ctx: Context }) {
  const params = useSearchParams();
  const [chats, setChats] = useState<any[]>([]),
    [selected, setSelected] = useState(params.get("conversation") || ""),
    [detail, setDetail] = useState<any>(null),
    [text, setText] = useState(""),
    [file, setFile] = useState<FileInfo | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [report, setReport] = useState(false),
    [reason, setReason] = useState("迷惑行為"),
    [eventKind, setEventKind] = useState("donation"),
    [eventDate, setEventDate] = useState(""),
    [privateDonor, setPrivateDonor] = useState<Donor | null>(null);
  const userId = ctx.user?.id;
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadList = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await api("conversations");
      setChats(r.conversations);
      setSelected((current) =>
        r.conversations.some((c: any) => c.id === current)
          ? current
          : r.conversations[0]?.id || "",
      );
    } catch (e) {
      ctx.notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId, ctx.notify]);
  const loadDetail = useCallback(async () => {
    if (!userId || !selected) return;
    try {
      const r = await api("conversations/" + selected);
      setDetail(r);
    } catch {
      setDetail(null);
    }
  }, [userId, selected]);
  useEffect(() => {
    setChats([]);
    setDetail(null);
    setLoading(true);
    void loadList();
    const timer = setInterval(loadList, 5000);
    return () => clearInterval(timer);
  }, [loadList]);
  useEffect(() => {
    setDetail(null);
    setFile(null);
    setText("");
    if (!selected || chats.find((c) => c.id === selected)?.status === "deleted")
      return;
    void loadDetail();
    const timer = setInterval(loadDetail, 5000);
    return () => clearInterval(timer);
  }, [selected, loadDetail, chats.find((c) => c.id === selected)?.status]);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [detail?.messages?.length]);
  useEffect(() => {
    setPrivateDonor(null);
    if (detail?.conversation?.disclosed && ctx.user?.role === "recipient")
      api("donors/" + detail.conversation.donor_id)
        .then((r) => setPrivateDonor(r.donor))
        .catch(() => {});
  }, [
    detail?.conversation?.disclosed,
    detail?.conversation?.donor_id,
    ctx.user?.role,
  ]);
  const chat = chats.find((c) => c.id === selected),
    c = detail?.conversation;
  const ownDonor = c?.donor_id === userId;
  const accepted = c?.status === "accepted";
  const admin = ctx.user?.role === "admin";
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    try {
      await api("conversations/" + selected, "PATCH", { action, ...extra });
      await loadList();
      await loadDetail();
    } catch (e) {
      ctx.notify((e as Error).message);
    }
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted) return;
    setBusy(true);
    try {
      await api("conversations/" + selected + "/messages", "POST", {
        body: text,
        fileId: file?.id,
      });
      setText("");
      setFile(null);
      await loadDetail();
    } catch (e) {
      ctx.notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!ctx.user)
    return (
      <div className="page-shell">
        <Empty
          title="ログインして会話をはじめましょう"
          icon={<MessageCircle size={33} />}
        >
          会話と画像は当事者と管理者だけが閲覧できます。
          <br />
          <button className="button" onClick={() => ctx.signIn("recipient")}>
            無料アカウントを作成
          </button>
        </Empty>
      </div>
    );
  return (
    <div className="page-shell chat-shell">
      <div className="page-heading compact">
        <span className="eyebrow">YOUR CONVERSATIONS</span>
        <h1>{admin ? "会話の管理閲覧" : "チャット"}</h1>
        <p>情報を確認しながら、あなたのペースで対話を。</p>
      </div>
      <div className="chat-layout">
        <aside className="conversation-list">
          <div className="conversation-list-heading">
            <h2>会話一覧</h2>
            <span>{chats.length}</span>
          </div>
          {loading ? (
            <Busy />
          ) : chats.length ? (
            chats.map((row) => (
              <button
                key={row.id}
                className={
                  "conversation-item " + (selected === row.id ? "active" : "")
                }
                onClick={() => setSelected(row.id)}
              >
                <span className="mini-avatar">
                  <UserRound size={19} />
                </span>
                <div>
                  <strong>
                    {row.status === "deleted"
                      ? "会話先が退会しました"
                      : admin
                        ? `${row.donor_name} × ${row.recipient_name}`
                        : ctx.user?.role === "donor"
                          ? row.recipient_name
                          : row.donor_name}
                  </strong>
                  <small>{STATE_LABELS[row.status]}</small>
                </div>
                {row.status === "requested" && <span className="unread-dot" />}
              </button>
            ))
          ) : (
            <Empty title="まだ会話がありません">
              {ctx.user.role === "recipient" ? (
                <Link href="/donors">提供者を探す</Link>
              ) : (
                "会話の申請が届くとここに表示されます。"
              )}
            </Empty>
          )}
        </aside>
        <section className="chat-main">
          {!selected ? (
            <Empty
              title="対話を、ここから。"
              icon={<MessageCircle size={37} />}
            >
              会話を選ぶとメッセージが表示されます。
            </Empty>
          ) : chat?.status === "deleted" ? (
            <Empty
              title="会話先が退会したため閲覧できません"
              icon={<LockKeyhole size={34} />}
            >
              会話本文・添付画像は削除されました。
            </Empty>
          ) : !detail ? (
            <Busy />
          ) : (
            <>
              <div className="chat-heading">
                <div>
                  <span className="mini-avatar">
                    <UserRound size={20} />
                  </span>
                  <strong>
                    {admin
                      ? `${chat?.donor_name} × ${chat?.recipient_name}`
                      : ownDonor
                        ? chat?.recipient_name
                        : chat?.donor_name}
                  </strong>
                  <span className="badge neutral">
                    {STATE_LABELS[c.status]}
                  </span>
                </div>
                {!admin && (
                  <button
                    className="icon-button"
                    aria-label="通報・ブロック"
                    onClick={() => setReport((v) => !v)}
                  >
                    <MoreHorizontal size={21} />
                  </button>
                )}
              </div>
              <div className="chat-disclaimer">
                <Eye size={13} />
                管理者はこの会話を閲覧できます。メール通知は送信しません。
              </div>
              {report && !admin && (
                <div className="chat-report">
                  <Select
                    value={reason}
                    onChange={setReason}
                    options={["迷惑行為", "虚偽情報", "無断開示", "その他"]}
                  />
                  <button
                    className="button button-outline button-small"
                    onClick={async () => {
                      try {
                        await api(
                          "conversations/" + selected + "/report",
                          "POST",
                          { reason },
                        );
                        ctx.notify("管理者への通報を受け付けました。");
                        setReport(false);
                      } catch (e) {
                        ctx.notify((e as Error).message);
                      }
                    }}
                  >
                    通報
                  </button>
                  <button
                    className="button danger button-small"
                    onClick={() => act("block")}
                  >
                    ブロック
                  </button>
                </div>
              )}
              {c.status === "requested" && (
                <div className="chat-request">
                  <MessageCircle size={23} />
                  <h3>
                    {ownDonor
                      ? "会話の申請が届いています"
                      : "提供者の承認をお待ちください"}
                  </h3>
                  <p>承認後に、メッセージ・画像を送信できます。</p>
                  {ownDonor && (
                    <div>
                      <button
                        className="button button-small"
                        onClick={() => act("accept")}
                      >
                        <Check size={16} />
                        会話を承認
                      </button>
                      <button
                        className="button button-outline button-small"
                        onClick={() => act("decline")}
                      >
                        辞退する
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="message-scroll" ref={scrollRef}>
                {detail.messages.length === 0 && accepted && (
                  <div className="first-message">
                    <Sprout size={26} />
                    <p>まずは、希望する地域や日程を話し合ってみましょう。</p>
                  </div>
                )}
                {detail.messages.map((m: any) => (
                  <div
                    key={m.id}
                    className={
                      "message-row " + (m.sender_id === userId ? "mine" : "")
                    }
                  >
                    <div className="message-bubble">
                      {admin && (
                        <small className="message-author">
                          {m.sender_name}
                        </small>
                      )}
                      {m.body && <p>{m.body}</p>}
                      {m.file_id && (
                        <a
                          href={"/api/files/" + m.file_id}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img
                            alt="会話に添付された画像"
                            src={"/api/files/" + m.file_id}
                          />
                        </a>
                      )}
                      <time>
                        {new Date(m.created_at).toLocaleString("ja-JP", {
                          timeZone: "Asia/Tokyo",
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  </div>
                ))}
              </div>
              {!admin && (
                <form className="message-compose" onSubmit={send}>
                  {file && (
                    <div className="pending-image">
                      <ImagePlus size={16} />
                      {file.original_name}
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="添付を取り消す"
                        onClick={async () => {
                          try {
                            await api("files/" + file.id, "DELETE");
                            setFile(null);
                          } catch (e) {
                            ctx.notify((e as Error).message);
                          }
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <div className="compose-row">
                    <label
                      className={
                        "attach-button " + (!accepted ? "disabled" : "")
                      }
                      aria-label="画像を添付"
                    >
                      <ImagePlus size={21} />
                      <input
                        disabled={!accepted || busy}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={async (e) => {
                          const input = e.currentTarget;
                          const f = input.files?.[0];
                          input.value = "";
                          if (!f) return;
                          setBusy(true);
                          try {
                            if (file) await api("files/" + file.id, "DELETE");
                            setFile(await upload(f, "chat", selected));
                          } catch (e) {
                            ctx.notify((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />
                    </label>
                    <textarea
                      aria-label="メッセージ"
                      rows={2}
                      maxLength={4000}
                      disabled={!accepted || busy}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={
                        accepted
                          ? "メッセージを入力…"
                          : "承認された会話で送信できます"
                      }
                    />
                    <button
                      className="send-button"
                      aria-label="メッセージを送信"
                      disabled={!accepted || busy || (!text.trim() && !file)}
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={19} />
                      ) : (
                        <Send size={19} />
                      )}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </section>
        <aside className="chat-details">
          {c && (
            <>
              <div className="chat-info-block">
                <h3>
                  <LockKeyhole size={16} />
                  情報の開示
                </h3>
                {ownDonor ? (
                  <>
                    <p>
                      この相手に顔写真と学歴の閲覧を許可します。いつでも取り消せます。
                    </p>
                    <button
                      className={
                        "button button-small full-width " +
                        (c.disclosed ? "button-outline" : "")
                      }
                      disabled={!accepted}
                      onClick={() => act("disclose", { enabled: !c.disclosed })}
                    >
                      {c.disclosed ? (
                        <>
                          <EyeOff size={15} />
                          開示を取り消す
                        </>
                      ) : (
                        <>
                          <Eye size={15} />
                          この相手に開示する
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <p>
                      {c.disclosed
                        ? "提供者が詳細情報の閲覧を許可しています。"
                        : "提供者の許可があると、顔写真・学歴を確認できます。"}
                    </p>
                    <Link href={"/donors/" + c.donor_id} className="text-link">
                      提供者ページ
                      <ArrowUpRight size={15} />
                    </Link>
                    {privateDonor?.privateInfo?.photoId && (
                      <img
                        className="chat-private-photo"
                        src={"/api/files/" + privateDonor.privateInfo.photoId}
                        alt="個別開示された顔写真"
                      />
                    )}
                  </>
                )}
              </div>
              <div className="chat-info-block">
                <h3>
                  <ClipboardList size={16} />
                  提供・妊娠・出生の記録
                </h3>
                <p>提供者が登録し、希望者が確認すると実績に反映します。</p>
                {ownDonor && accepted && (
                  <div className="event-form">
                    <select
                      aria-label="実績の種類"
                      value={eventKind}
                      onChange={(e) => setEventKind(e.target.value)}
                    >
                      <option value="donation">提供</option>
                      <option value="pregnancy">妊娠報告</option>
                      <option value="birth">出生報告</option>
                    </select>
                    <input
                      type="date"
                      aria-label="実績の日付"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                    />
                    <button
                      className="button button-outline button-small"
                      disabled={!eventDate}
                      onClick={async () => {
                        try {
                          await api(
                            "conversations/" + selected + "/events",
                            "POST",
                            { kind: eventKind, date: eventDate },
                          );
                          setEventDate("");
                          await loadDetail();
                        } catch (e) {
                          ctx.notify((e as Error).message);
                        }
                      }}
                    >
                      確認を依頼
                    </button>
                  </div>
                )}
                {detail.events.map((event: any) => (
                  <div className="event-item" key={event.id}>
                    <strong>
                      {
                        {
                          donation: "提供",
                          pregnancy: "妊娠報告",
                          birth: "出生報告",
                        }[event.kind as "donation"]
                      }
                    </strong>
                    <small>{event.occurred_on}</small>
                    <span>
                      {event.status === "confirmed"
                        ? "確認済み"
                        : event.status === "rejected"
                          ? "未承認"
                          : "確認待ち"}
                    </span>
                    {ctx.user?.role === "recipient" &&
                      event.status === "pending" && (
                        <div>
                          <button
                            className="text-button"
                            onClick={async () => {
                              try {
                                await api("events/" + event.id, "PATCH", {
                                  confirmed: true,
                                });
                                await loadDetail();
                              } catch (e) {
                                ctx.notify((e as Error).message);
                              }
                            }}
                          >
                            確認する
                          </button>
                          <button
                            className="text-button muted"
                            onClick={async () => {
                              try {
                                await api("events/" + event.id, "PATCH", {
                                  confirmed: false,
                                });
                                await loadDetail();
                              } catch (e) {
                                ctx.notify((e as Error).message);
                              }
                            }}
                          >
                            承認しない
                          </button>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
function AdminPage({ ctx }: { ctx: Context }) {
  const [apps, setApps] = useState<any[]>([]),
    [donors, setDonors] = useState<any[]>([]),
    [reports, setReports] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState("applications"),
    [selected, setSelected] = useState<any>(null),
    [confirmed, setConfirmed] = useState(false),
    [reason, setReason] = useState("書類が不鮮明"),
    [deviations, setDeviations] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (ctx.user?.role !== "admin") return;
    try {
      const [a, d, r] = await Promise.all([
        api("admin/applications"),
        api("admin/donors"),
        api("admin/reports"),
      ]);
      setApps(a.applications);
      setDonors(d.donors);
      setReports(r.reports);
      setSelected((old: any) =>
        old ? a.applications.find((x: any) => x.id === old.id) || null : null,
      );
    } catch (e) {
      ctx.notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [ctx.user?.id, ctx.user?.role, ctx.notify]);
  useEffect(() => {
    void load();
  }, [load]);
  const close = useCallback(() => setSelected(null), []);
  const action = async (type: string) => {
    setBusy(true);
    try {
      await api("admin/applications/" + selected.id, "PATCH", {
        action: type,
        confirmed,
        reason,
        academicDeviations: Object.fromEntries(
          Object.entries(deviations).map(([k, v]) => [
            k,
            v === "" ? null : Number(v),
          ]),
        ),
      });
      ctx.notify(
        type === "approve"
          ? "承認し、証明書原本を削除しました。"
          : "審査状態を更新しました。",
      );
      await load();
    } catch (e) {
      ctx.notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (ctx.user?.role !== "admin")
    return (
      <div className="page-shell">
        <Empty title="管理者権限が必要です" icon={<LockKeyhole size={34} />}>
          {ctx.demo
            ? "上部の「管理者で試す」で、審査・会話閲覧を確認できます。"
            : "管理者アカウントでログインしてください。"}
        </Empty>
      </div>
    );
  return (
    <div className="page-shell admin-shell">
      <div className="page-heading">
        <span className="eyebrow">ADMINISTRATION</span>
        <h1>管理ページ</h1>
        <p>書類を照合し、登録・証明書更新を判断します。</p>
      </div>
      <div className="admin-stats">
        <div>
          <ClipboardList />
          <small>支払い済み・審査待ち</small>
          <strong>{apps.filter((a) => a.status === "queued").length}</strong>
        </div>
        <div>
          <FileCheck2 />
          <small>審査中</small>
          <strong>{apps.filter((a) => a.status === "reviewing").length}</strong>
        </div>
        <div>
          <Users />
          <small>掲載中の提供者</small>
          <strong>
            {donors.filter((d) => d.status === "approved").length}
          </strong>
        </div>
        <div>
          <AlertCircle />
          <small>通報</small>
          <strong>{reports.length}</strong>
        </div>
      </div>
      <div className="admin-toolbar">
        <div className="tabs">
          <button
            className={tab === "applications" ? "active" : ""}
            onClick={() => setTab("applications")}
          >
            登録・更新審査
          </button>
          <button
            className={tab === "donors" ? "active" : ""}
            onClick={() => setTab("donors")}
          >
            提供者管理
          </button>
          <button
            className={tab === "reports" ? "active" : ""}
            onClick={() => setTab("reports")}
          >
            通報
          </button>
        </div>
        <Link href="/chat" className="button button-outline button-small">
          <Eye size={16} />
          会話を閲覧
        </Link>
      </div>
      {loading ? (
        <Busy />
      ) : (
        <section className="panel admin-table-wrap">
          {tab === "applications" ? (
            apps.length ? (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>提供者</th>
                    <th>申請</th>
                    <th>受付日</th>
                    <th>支払い</th>
                    <th>状態</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {apps.map((a) => (
                    <tr key={a.id}>
                      <td>{a.display_id}</td>
                      <td>{a.kind === "initial" ? "登録" : "証明書更新"}</td>
                      <td>
                        {new Date(a.created_at).toLocaleDateString("ja-JP", {
                          timeZone: "Asia/Tokyo",
                        })}
                      </td>
                      <td>
                        {a.paid ? (
                          <span className="paid-mark">
                            <Check size={13} />
                            5,000円
                          </span>
                        ) : (
                          "未払い"
                        )}
                      </td>
                      <td>
                        <span className="badge neutral">
                          {STATE_LABELS[a.status]}
                        </span>
                      </td>
                      <td>
                        <button
                          className="text-link"
                          onClick={() => {
                            setSelected(a);
                            setConfirmed(false);
                            setDeviations({});
                          }}
                        >
                          確認する
                          <ChevronRight size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty title="現在、申請はありません">
                提供者が書類を提出すると、ここに表示されます。
              </Empty>
            )
          ) : tab === "donors" ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>提供者</th>
                  <th>状態</th>
                  <th>掲載管理</th>
                </tr>
              </thead>
              <tbody>
                {donors.map((d) => (
                  <tr key={d.id}>
                    <td>{d.display_id}</td>
                    <td>{STATE_LABELS[d.status]}</td>
                    <td>
                      {["approved", "paused", "suspended"].includes(
                        d.status,
                      ) && (
                        <button
                          className="text-link"
                          onClick={async () => {
                            try {
                              await api("admin/donors/" + d.id, "PATCH", {
                                paused: d.status === "approved",
                              });
                              await load();
                            } catch (e) {
                              ctx.notify((e as Error).message);
                            }
                          }}
                        >
                          {d.status !== "approved"
                            ? "掲載を再開"
                            : "掲載を停止"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : reports.length ? (
            <div className="report-list">
              {reports.map((r) => (
                <div key={r.id}>
                  <AlertCircle size={17} />
                  <strong>{r.reason}</strong>
                  <span>
                    {new Date(r.created_at).toLocaleDateString("ja-JP")}
                  </span>
                  <Link href={"/chat?conversation=" + r.conversation_id}>
                    会話を確認
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="通報はありません" />
          )}
        </section>
      )}
      {selected && (
        <Modal title={selected.display_id + " の審査"} onClose={close}>
          <div className="review-modal-meta">
            <span className="badge neutral">
              {STATE_LABELS[selected.status]}
            </span>
            <span>
              {selected.paid ? "審査料の支払い済み" : "未払い・審査開始不可"}
            </span>
          </div>
          <dl className="definition-list">
            <div>
              <dt>生年月日</dt>
              <dd>{selected.birth_date}</dd>
            </div>
            <div>
              <dt>本人連絡先</dt>
              <dd>{selected.email}</dd>
            </div>
            <div>
              <dt>身体情報</dt>
              <dd>
                {selected.profile.height}cm / {selected.profile.weight}kg /{" "}
                {selected.profile.bodyFat}% / 筋肉量{selected.profile.muscle}kg
              </dd>
            </div>
            <div>
              <dt>身体測定日</dt>
              <dd>{selected.profile.bodyDate}</dd>
            </div>
            <div>
              <dt>精液検査日</dt>
              <dd>{selected.profile.semenDate}</dd>
            </div>
          </dl>
          <h3>学歴・IQの根拠</h3>
          {selected.profile.academics.map((a: Academic) => (
            <div className="academic-review" key={a.kind}>
              <strong>
                {a.kind === "wais"
                  ? "WAIS 全検査IQ：" + a.iq
                  : [a.school, a.faculty, a.department].join(" ")}
              </strong>
              {a.kind !== "wais" && (
                <Field
                  label="指定サイトで照合した偏差値"
                  note={
                    a.deviation
                      ? "掲載データから取得済み。学校・学科の一致を確認してください。"
                      : "現在掲載されている学科の最大値を照合。取得できない場合は空欄。"
                  }
                >
                  <input
                    type="number"
                    step="0.1"
                    min={20}
                    max={90}
                    disabled={!!a.deviation}
                    value={a.deviation ?? deviations[a.kind] ?? ""}
                    onChange={(e) =>
                      setDeviations((old) => ({
                        ...old,
                        [a.kind]: e.target.value,
                      }))
                    }
                  />
                </Field>
              )}
            </div>
          ))}
          <h3>提出書類</h3>
          <div className="review-documents">
            {selected.files.map((f: FileInfo) => (
              <a
                target="_blank"
                rel="noreferrer"
                href={"/api/files/" + f.id}
                key={f.id}
              >
                <FileText size={18} />
                <span>
                  {DOC_LABELS[f.kind]}
                  <small>{f.original_name}</small>
                </span>
                <ArrowUpRight size={16} />
              </a>
            ))}
          </div>
          {!selected.files.length && (
            <p className="muted">審査終了後の原本は削除済みです。</p>
          )}
          <details className="review-details">
            <summary>検査値・提供条件を確認</summary>
            <dl className="definition-list">
              {SEMEN_FIELDS.map((f) => (
                <div key={f.key}>
                  <dt>{f.label}</dt>
                  <dd>{value(selected.profile.semen[f.key], f.unit)}</dd>
                </div>
              ))}
              {INFECTIONS.map((k) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{selected.profile.infections[k]}</dd>
                </div>
              ))}
              {[
                "smoking",
                "drinking",
                "exercise",
                "history",
                "hereditary",
                "allergy",
                "contactPolicy",
                "futureInfo",
              ].map((k, i) => (
                <div key={k}>
                  <dt>
                    {
                      [
                        "喫煙",
                        "飲酒",
                        "運動",
                        "既往歴",
                        "遺伝性疾患",
                        "アレルギー",
                        "連絡方針",
                        "将来の情報提供",
                      ][i]
                    }
                  </dt>
                  <dd>{selected.profile[k]}</dd>
                </div>
              ))}
              <div>
                <dt>方法・曜日</dt>
                <dd>
                  {selected.profile.methods.join("・")} /{" "}
                  {selected.profile.weekdays.join("・")}
                </dd>
              </div>
            </dl>
          </details>
          {selected.status === "queued" && (
            <button
              disabled={busy || !selected.paid}
              className="button full-width"
              onClick={() => action("start")}
            >
              <ClipboardList size={17} />
              審査を開始する
            </button>
          )}
          {selected.status === "reviewing" && (
            <div className="admin-review-actions">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                身分証・卒業/WAIS・検査値の照合を完了しました
              </label>
              <button
                className="button full-width"
                disabled={!confirmed || busy}
                onClick={() => action("approve")}
              >
                <CheckCircle2 size={17} />
                承認して掲載・原本を削除
              </button>
              <Select
                value={reason}
                onChange={setReason}
                options={[
                  "書類が不鮮明",
                  "入力と書類が不一致",
                  "必要書類が不足",
                  "登録条件を満たさない",
                ]}
              />
              <div className="form-grid">
                <button
                  className="button button-outline"
                  disabled={busy}
                  onClick={() => action("revise")}
                >
                  修正を依頼
                </button>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() => action("reject")}
                >
                  不承認・原本を削除
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
function LegalPage({ page }: { page: string }) {
  const title =
    page === "/terms"
      ? "利用規約"
      : page === "/privacy"
        ? "個人情報の取り扱い"
        : "特定商取引法に基づく表記";
  return (
    <div className="page-shell legal-page">
      <div className="page-heading">
        <span className="eyebrow">INFORMATION</span>
        <h1>{title}</h1>
      </div>
      <section className="panel">
        {page === "/terms" ? (
          <>
            <h2>サービスと利用条件</h2>
            <p>
              日本国内向け、18歳以上の方が対象です。個人間の精子提供について情報を確認し、対話する場を提供します。運営による医療サービス・提供の実施・結果の保証はありません。
            </p>
            <h2>登録・審査料</h2>
            <p>
              希望者は無料。提供者の登録と証明書更新は、審査開始前に税込5,000円を支払います。同時更新は一括料金です。不承認や自己都合退会による返金はありません。同一申請の差し戻し修正に追加料金はかかりません。二重決済やシステム起因の誤請求は運営が個別確認します。
            </p>
            <h2>情報と合意</h2>
            <p>
              学歴・WAISは最低1つの証明が必要です。感染症検査は任意です。検査の掲載上の有効期間は2年とし、検査日を表示します。掲載情報から現在の感染状況、子どもの性質、妊娠・出産の結果を保証しません。
            </p>
            <p>
              方法、日程、場所、交通費、提供後の連絡、将来の情報提供は双方で合意してください。利用者間の謝礼の設定・授受に運営は関与しません。合意を強制する行為、虚偽情報、他者の情報の無断開示、迷惑行為を禁止します。
            </p>
            <h2>運営による閲覧・対応</h2>
            <p>
              管理者は審査・通報対応・サービス運営のために会話と添付画像を閲覧できます。掲載・募集は手動で休止でき、規約違反等の場合は停止することがあります。
            </p>
            <h2>退会</h2>
            <p>
              退会すると登録情報、会話、画像、実績を削除します。相手側の会話も閲覧できなくなります。サイトで将来にわたって情報を保持・提供することはありません。必要な連絡方法は当事者間で取り決めてください。
            </p>
          </>
        ) : page === "/privacy" ? (
          <>
            <h2>収集する情報</h2>
            <p>
              メールアドレス、生年月日、身体・検査・健康情報、学歴またはWAIS、提供条件、本人確認・証明書、任意の顔写真、会話・画像、双方確認の実績、決済の確認情報を登録・審査・検索・対話のために取り扱います。
            </p>
            <h2>公開範囲</h2>
            <p>
              年齢、身体情報、IQの参考値、検査値、健康・生活習慣、提供条件、確認済みの実績は一般公開します。生年月日・メールアドレス・本人確認書類・証明書は公開しません。顔写真・学校名は、本人が許可した会話相手に開示します。
            </p>
            <h2>書類・画像</h2>
            <p>
              ファイルは非公開領域へ保存し、サーバーでアクセス権限を確認します。画像の位置情報等のメタデータは保存時に除去します。審査が承認または不承認で終了した際に、提出した証明書原本を削除します。差し戻し中の書類は再確認のために保持します。
            </p>
            <h2>削除と決済</h2>
            <p>
              退会時にサイト本体の情報を削除します。バックアップを利用する公開環境では、その保存期限と削除手順を事前に案内します。決済事業者が保持する取引記録、利用者自身が取得・保存した情報は、サイト側から削除できません。
            </p>
            <h2>Cookie</h2>
            <p>
              ログイン状態を保持するCookieを使用します。広告・アクセス解析用のCookieは使用しません。
            </p>
          </>
        ) : (
          <>
            <div className="notice">
              <AlertCircle size={21} />
              <p>
                運営者情報は未設定です。本番で受付を開始する前に、運営者と連絡先等を設定してください。
              </p>
            </div>
            <dl className="definition-list">
              <div>
                <dt>サービス名</dt>
                <dd>コウノトリのつばさ</dd>
              </div>
              <div>
                <dt>運営者・住所・連絡先</dt>
                <dd>公開前に設定</dd>
              </div>
              <div>
                <dt>販売価格</dt>
                <dd>登録審査料・証明書更新審査料 各5,000円（税込）</dd>
              </div>
              <div>
                <dt>支払時期</dt>
                <dd>審査開始前</dd>
              </div>
              <div>
                <dt>支払方法</dt>
                <dd>
                  接続した決済サービスによる支払い。デモ環境では実課金なし。
                </dd>
              </div>
              <div>
                <dt>追加費用</dt>
                <dd>検査等の取得費用、利用者間で合意した交通費等は別途</dd>
              </div>
              <div>
                <dt>提供時期</dt>
                <dd>支払い確認後に審査。承認後に掲載。</dd>
              </div>
              <div>
                <dt>キャンセル・返金</dt>
                <dd>
                  審査料は不承認・自己都合退会による返金なし。二重決済・誤請求は個別対応。
                </dd>
              </div>
            </dl>
          </>
        )}
      </section>
    </div>
  );
}
